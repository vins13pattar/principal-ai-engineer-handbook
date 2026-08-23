/**
 * Everything needed to write an episode's transcript again, in one committed file.
 *
 * The run directory under `.podcast/` is scratch: git-ignored, named by
 * timestamp, and the first thing anyone clears when a disk fills. Until this
 * existed it was also the only copy of `script.json`, which meant a change to
 * `renderTranscript` could only reach published episodes by regenerating them
 * -- paying a second time for words already written and already spoken.
 *
 * So the archive is committed, one file per episode, holding the plan, the
 * script, and the metadata the transcript header records. It is not the audio's
 * source of truth -- the audio is already rendered -- it is the text's.
 *
 * Deliberately not the manifest: the manifest describes a *run* (timings, cost,
 * usage, failure) and there is one per attempt. This describes the *episode*,
 * and there is one per published page.
 */

import type { DialogueScript } from "./dialogue.ts";
import type { EpisodePlan } from "./schema.ts";
import type { TranscriptMeta } from "./transcript.ts";

/** Bumped only when a reader would misread an older file, not when a field is added. */
export const ARCHIVE_VERSION = 1;

export interface EpisodeArchive {
  archiveVersion: number;
  /** The published slug, so a renamed file is still self-identifying. */
  slug: string;
  meta: TranscriptMeta;
  plan: EpisodePlan;
  script: DialogueScript;
}

/**
 * Parse an archive, naming what is wrong and which file it is in.
 *
 * Checks the fields `renderTranscript` reads rather than restating the whole
 * plan schema: a plan that reached an archive was already validated on the way
 * out of the model, and a second copy of that schema would be one more thing to
 * keep in step. What it does catch is the realistic corruption -- a truncated
 * write, a hand-edit, an older format -- where the shape is simply not there.
 */
export function parseArchive(json: unknown, source: string): EpisodeArchive {
  // Annotated on the variable, not just the arrow: TypeScript narrows through a
  // never-returning call only when the declaration carries the type, so without
  // this every check below has to repeat itself to convince the compiler.
  const fail: (why: string) => never = (why) => {
    throw new Error(`${source}: ${why}`);
  };

  if (typeof json !== "object" || json === null) fail("not an object");
  const archive = json as Partial<EpisodeArchive>;

  if (archive.archiveVersion !== ARCHIVE_VERSION) {
    fail(`archive version ${String(archive.archiveVersion)}, expected ${ARCHIVE_VERSION}`);
  }
  if (typeof archive.slug !== "string" || archive.slug === "") fail("no slug");
  if (!archive.meta || typeof archive.meta.documentId !== "string") fail("no metadata");
  if (!archive.plan || !Array.isArray(archive.plan.beats)) fail("no plan beats");
  if (!archive.script || !Array.isArray(archive.script.turns)) fail("no script turns");
  if (archive.script.turns.length === 0) fail("script has no turns");

  return archive as EpisodeArchive;
}

/** The committed path for an episode's archive, relative to the repository root. */
export function archivePath(slug: string): string {
  return `episodes/${slug}.json`;
}
