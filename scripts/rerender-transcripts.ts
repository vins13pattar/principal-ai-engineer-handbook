/**
 * Rewrite every published transcript from its committed archive.
 *
 * Free and offline: `episodes/<slug>.json` holds the plan, the script, and the
 * header metadata, so a change to `renderTranscript` reaches every published
 * episode without a model call or a re-synthesis. The audio is not touched --
 * the words spoken did not change, only how they are written down.
 *
 * Reads the archive rather than the run directory on purpose. `.podcast/` is
 * git-ignored scratch that may be cleared at any time; the archive is committed,
 * which is what makes this repeatable a year from now.
 *
 * Usage:
 *   node --experimental-strip-types scripts/rerender-transcripts.ts [--check]
 *
 * `--check` reports what would change without writing.
 */

import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { archivePath, parseArchive, renderTranscript } from "@handbook/podcast-engine";

const root = process.cwd();
const check = process.argv.includes("--check");
const run = promisify(execFile);

const pageDir = join(root, "apps/handbook/src/transcripts");
const slugs = (await readdir(pageDir))
  .filter((name) => name.endsWith(".md"))
  .map((name) => name.replace(/\.md$/, ""))
  .sort();

let changed = 0;
const unarchived: string[] = [];

for (const slug of slugs) {
  const path = join(root, archivePath(slug));
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw === null) {
    unarchived.push(slug);
    continue;
  }

  const { meta, plan, script } = parseArchive(JSON.parse(raw), archivePath(slug));
  const rendered = renderTranscript(plan, script, meta);

  // The transcript lives in two places: the archive's own rendering, kept beside
  // the words it came from, and the derived copy the page imports.
  const beside = join(root, "episodes", `${slug}.md`);
  const stale = (await readFile(beside, "utf8").catch(() => null)) !== rendered;
  if (stale) changed += 1;

  if (check) {
    if (stale) console.log(`  would rewrite ${slug}`);
    continue;
  }

  await writeFile(beside, rendered);
  // Regenerated every run rather than only when the transcript moved: that makes
  // this idempotent, and repairs a page copy that fell out of step for any reason.
  await run(join(root, "scripts/page-transcript.sh"), [beside, join(pageDir, `${slug}.md`)]);
  if (stale) console.log(`  rewrote ${slug}`);
}

console.log(`\n${changed} of ${slugs.length} transcripts ${check ? "would change" : "rewritten"}`);
if (unarchived.length > 0) {
  console.log(`\n${unarchived.length} have no archive and were left alone:`);
  for (const slug of unarchived) console.log(`  ${slug}`);
  process.exit(1);
}
