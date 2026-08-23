/**
 * Copy an episode's words out of its scratch run directory and into the repository.
 *
 * `.podcast/` is git-ignored and disposable. Everything that makes a transcript
 * reproducible -- the plan, the script, the header metadata -- lived only there,
 * so clearing it turned "re-render sixty transcripts for free" into "generate
 * sixty episodes again". This writes the committed copy.
 *
 * Run for one episode at publish time, or over every published episode to
 * backfill. Idempotent: an archive identical to what is already on disk is left
 * alone, so re-running it produces no diff.
 *
 * Usage:
 *   node --experimental-strip-types scripts/archive-episode.ts <runDir> <slug>
 *   node --experimental-strip-types scripts/archive-episode.ts --all
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ARCHIVE_VERSION, archivePath, type EpisodeArchive } from "@handbook/podcast-engine";
import type { DialogueScript, EpisodePlan, TranscriptMeta } from "@handbook/podcast-engine";

const root = process.cwd();
const all = process.argv.includes("--all");

/**
 * The header `renderTranscript` wrote, read back.
 *
 * The manifest records the run, not the episode: it has no page URL and no
 * measured runtime, both of which the transcript header does have.
 */
function parseHeader(transcript: string, source: string): TranscriptMeta {
  const find = (pattern: RegExp, what: string): RegExpMatchArray => {
    const match = transcript.match(pattern);
    if (!match) throw new Error(`${source}: could not read the ${what} from the header`);
    return match;
  };

  const from = find(/^- \*\*Source:\*\* \[([^\]]+)\]\(([^)]+)\)$/m, "source");
  const runtime = find(/^- \*\*Runtime:\*\* (unmeasured|\d+:\d{2}) /m, "runtime");
  const written = find(/^- \*\*Written by:\*\* (.+) on (\S+)$/m, "model");
  const voices = find(/^- \*\*Voices:\*\* (\S+) \(host\), (\S+) \(guest\)$/m, "voices");

  let audioSeconds: number | null = null;
  if (runtime[1] !== "unmeasured") {
    const [minutes, seconds] = runtime[1]!.split(":");
    audioSeconds = Number(minutes) * 60 + Number(seconds);
  }

  return {
    documentId: from[1]!,
    url: from[2]!,
    modelId: written[1]!,
    generated: written[2]!,
    voices: { host: voices[1]!, guest: voices[2]! },
    audioSeconds,
  };
}

/** The newest run for a slug that still holds everything an archive needs. */
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

/** Returns true when the archive on disk changed. */
async function archive(runDir: string, slug: string): Promise<boolean> {
  const transcript = await readFile(join(runDir, "transcript.md"), "utf8");
  const archive: EpisodeArchive = {
    archiveVersion: ARCHIVE_VERSION,
    slug,
    meta: parseHeader(transcript, join(runDir, "transcript.md")),
    plan: JSON.parse(await readFile(join(runDir, "plan.json"), "utf8")) as EpisodePlan,
    script: JSON.parse(await readFile(join(runDir, "script.json"), "utf8")) as DialogueScript,
  };

  const out = join(root, archivePath(slug));
  // Two spaces and a trailing newline: these are committed files, and a diff
  // should show the line that changed rather than one very long line.
  const rendered = `${JSON.stringify(archive, null, 2)}\n`;
  if ((await readFile(out, "utf8").catch(() => null)) === rendered) return false;

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, rendered);
  return true;
}

if (all) {
  const pageDir = join(root, "apps/handbook/src/transcripts");
  const slugs = (await readdir(pageDir))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""))
    .sort();

  let written = 0;
  const orphaned: string[] = [];

  for (const slug of slugs) {
    const runDir = await latestRun(slug);
    if (runDir === null) {
      orphaned.push(slug);
      continue;
    }
    if (await archive(runDir, slug)) {
      written += 1;
      console.log(`  archived ${slug}`);
    }
  }

  console.log(`\n${written} of ${slugs.length} archives written`);
  if (orphaned.length > 0) {
    // Not a warning to skim past: these are the episodes whose words exist only
    // in the published transcript, and regenerating them costs money.
    console.log(`\n${orphaned.length} have no run directory left and CANNOT be re-rendered:`);
    for (const slug of orphaned) console.log(`  ${slug}`);
    process.exit(1);
  }
} else {
  const [runDir, slug] = process.argv.slice(2);
  if (!runDir || !slug) {
    console.error("usage: archive-episode.ts <runDir> <slug> | --all");
    process.exit(2);
  }
  await archive(runDir, slug);
  console.log(`  archived ${archivePath(slug)}`);
}
