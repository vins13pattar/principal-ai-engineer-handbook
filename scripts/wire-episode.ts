/**
 * Put an episode's player onto its page.
 *
 * The one step of publishing that edits content a human wrote, which is why it
 * only ever inserts. It adds an import and a component block and touches
 * nothing else — no reflowing, no reformatting, no rewriting of prose. If the
 * page already has a player it stops, so a re-run after a regenerated episode
 * is safe.
 *
 * Usage:
 *   node --experimental-strip-types scripts/wire-episode.ts <documentId> <slug> <duration> <model> <generated> [--check]
 *
 * `--check` prints the resulting file to stdout instead of writing it.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { loadAllDocuments } from "@handbook/content";

const [documentId, slug, duration, model, generated] = process.argv.slice(2);
const check = process.argv.includes("--check");

if (!documentId || !slug || !duration || !model || !generated) {
  console.error(
    "usage: wire-episode.ts <documentId> <slug> <duration> <model> <generated> [--check]",
  );
  process.exit(2);
}

const root = process.cwd();
const documents = await loadAllDocuments(root);
const document = documents.get(documentId);

if (!document) {
  console.error(`no such document: ${documentId}`);
  process.exit(1);
}

const pagePath = join(root, document.sourcePath);
const source = await readFile(pagePath, "utf8");

if (source.includes("<EpisodePlayer")) {
  console.log(`already wired: ${document.sourcePath}`);
  process.exit(0);
}

// Computed rather than assumed: collections sit at different depths, and a
// hardcoded `../../../../` is correct for learn modules and wrong for the rest.
const transcriptPath = join(root, "apps/handbook/src/transcripts", `${slug}.md`);
let importPath = relative(dirname(pagePath), transcriptPath);
if (!importPath.startsWith(".")) importPath = `./${importPath}`;

const player = `<EpisodePlayer
  file="${slug}.m4a"
  duration="${duration}"
  model="${model}"
  generated="${generated}"
>
  <Transcript slot="transcript" />
</EpisodePlayer>`;

const transcriptImport = `import { Content as Transcript } from "${importPath}";`;

const lines = source.split("\n");

// The frontmatter runs to the second `---`; everything after it is the body,
// and the player belongs at the top of the body, above the first prose.
let frontmatterEnd = -1;
let seen = 0;
for (const [index, line] of lines.entries()) {
  if (line.trim() === "---") {
    seen += 1;
    if (seen === 2) {
      frontmatterEnd = index;
      break;
    }
  }
}
if (frontmatterEnd === -1) {
  console.error(
    `${document.sourcePath} has no frontmatter; refusing to guess where the body starts`,
  );
  process.exit(1);
}

const componentsImport = lines.findIndex((line) => line.includes('} from "@handbook/components"'));

let out: string[];

if (componentsImport !== -1) {
  // Two shapes exist in this repo: learn modules import a dozen components
  // across many lines, ADRs import one on a single line. Reading the second as
  // if it were the first found no `import {` line, searched back to index -1,
  // and swept the whole frontmatter into the import list.
  const singleLine = lines[componentsImport]!.includes("import {");
  const openIndex = singleLine
    ? componentsImport
    : lines.findIndex((line, index) => index <= componentsImport && line.trim() === "import {");

  if (openIndex === -1) {
    console.error(
      `${document.sourcePath} imports from @handbook/components in a shape this script does not recognise; refusing to guess`,
    );
    process.exit(1);
  }

  const names = singleLine
    ? (lines[componentsImport]!.match(/\{([^}]*)\}/)?.[1] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    : lines
        .slice(openIndex + 1, componentsImport)
        .map((line) => line.trim().replace(/,$/, ""))
        .filter(Boolean);
  if (!names.includes("EpisodePlayer")) names.push("EpisodePlayer");
  names.sort((a, b) => a.localeCompare(b));

  const rebuilt = [
    "import {",
    ...names.map((name) => `  ${name},`),
    '} from "@handbook/components";',
  ];

  // The transcript import goes after the last import line, so it sits with the
  // others rather than orphaned above the prose.
  let lastImport = componentsImport;
  for (let index = componentsImport + 1; index < lines.length; index += 1) {
    if (lines[index]!.startsWith("import ")) lastImport = index;
    else if (lines[index]!.trim() !== "") break;
  }

  const shift = rebuilt.length - (componentsImport - openIndex + 1);
  out = [
    ...lines.slice(0, openIndex),
    ...rebuilt,
    ...lines.slice(componentsImport + 1, lastImport + 1),
    transcriptImport,
    "",
    player,
    ...lines.slice(lastImport + 1),
  ];
  void shift;
} else {
  // A page with no component imports at all: introduce both.
  out = [
    ...lines.slice(0, frontmatterEnd + 1),
    "",
    'import { EpisodePlayer } from "@handbook/components";',
    transcriptImport,
    "",
    player,
    ...lines.slice(frontmatterEnd + 1),
  ];
}

const result = out.join("\n").replace(/\n{3,}/g, "\n\n");

if (check) {
  console.log(result.split("\n").slice(0, 60).join("\n"));
} else {
  await writeFile(pagePath, result);
  console.log(`wired ${document.sourcePath}`);
}
