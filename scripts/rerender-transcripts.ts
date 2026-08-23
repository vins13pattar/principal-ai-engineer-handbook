/**
 * Rewrite every published transcript from the script that produced it.
 *
 * Free and offline: `script.json` and `plan.json` already hold every word, so a
 * change to `renderTranscript` reaches sixty-odd published episodes without a
 * model call or a re-synthesis. The audio is not touched -- the words spoken
 * did not change, only how they are written down.
 *
 * Metadata comes from the existing transcript's own header rather than from the
 * manifest, which does not record the page URL or the measured runtime. That
 * keeps a re-render byte-identical except for the change being made.
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
import { renderTranscript, type TranscriptMeta } from "@handbook/podcast-engine";
import type { DialogueScript } from "@handbook/podcast-engine";
import type { EpisodePlan } from "@handbook/podcast-engine";

const root = process.cwd();
const check = process.argv.includes("--check");
const run = promisify(execFile);

/** The header `renderTranscript` wrote, read back. */
function parseHeader(transcript: string): TranscriptMeta {
  const find = (pattern: RegExp, what: string): RegExpMatchArray => {
    const match = transcript.match(pattern);
    if (!match) throw new Error(`could not read the ${what} from the transcript header`);
    return match;
  };

  const source = find(/^- \*\*Source:\*\* \[([^\]]+)\]\(([^)]+)\)$/m, "source");
  const runtime = find(/^- \*\*Runtime:\*\* (unmeasured|\d+:\d{2}) /m, "runtime");
  const written = find(/^- \*\*Written by:\*\* (.+) on (\S+)$/m, "model");
  const voices = find(/^- \*\*Voices:\*\* (\S+) \(host\), (\S+) \(guest\)$/m, "voices");

  let audioSeconds: number | null = null;
  if (runtime[1] !== "unmeasured") {
    const [minutes, seconds] = runtime[1]!.split(":");
    audioSeconds = Number(minutes) * 60 + Number(seconds);
  }

  return {
    documentId: source[1]!,
    url: source[2]!,
    modelId: written[1]!,
    generated: written[2]!,
    voices: { host: voices[1]!, guest: voices[2]! },
    audioSeconds,
  };
}

/** The newest run for a slug that still has everything needed to re-render. */
async function latestRun(slug: string): Promise<string | null> {
  const base = join(root, ".podcast", slug);
  const runs = await readdir(base).catch(() => []);
  for (const run of runs.sort().reverse()) {
    const dir = join(base, run);
    const files = await readdir(dir).catch(() => []);
    if (["plan.json", "script.json", "transcript.md"].every((name) => files.includes(name))) {
      return dir;
    }
  }
  return null;
}

const pageDir = join(root, "apps/handbook/src/transcripts");
const slugs = (await readdir(pageDir))
  .filter((name) => name.endsWith(".md"))
  .map((name) => name.replace(/\.md$/, ""))
  .sort();

let changed = 0;
const orphaned: string[] = [];

for (const slug of slugs) {
  const dir = await latestRun(slug);
  if (dir === null) {
    // A published episode whose run directory is gone cannot be re-rendered.
    // Reported rather than skipped silently: it means the page and the source
    // of truth have parted company.
    orphaned.push(slug);
    continue;
  }

  const existing = await readFile(join(dir, "transcript.md"), "utf8");
  const plan = JSON.parse(await readFile(join(dir, "plan.json"), "utf8")) as EpisodePlan;
  const script = JSON.parse(await readFile(join(dir, "script.json"), "utf8")) as DialogueScript;

  const rendered = renderTranscript(plan, script, parseHeader(existing));
  const stale = rendered !== existing;
  if (stale) changed += 1;

  if (check) {
    if (stale) console.log(`  would rewrite ${slug}`);
    continue;
  }

  if (stale) await writeFile(join(dir, "transcript.md"), rendered);

  // The page copy is derived, so it is regenerated every time rather than only
  // when the transcript moved: that makes the script idempotent, and it repairs
  // a page copy that fell out of step with the run directory for any reason.
  await run(join(root, "scripts/page-transcript.sh"), [
    join(dir, "transcript.md"),
    join(pageDir, `${slug}.md`),
  ]);
  if (stale) console.log(`  rewrote ${slug}`);
}

console.log(`\n${changed} of ${slugs.length} transcripts ${check ? "would change" : "rewritten"}`);
if (orphaned.length > 0) {
  console.log(`${orphaned.length} have no run directory and were left alone:`);
  for (const slug of orphaned) console.log(`  ${slug}`);
}
