/**
 * The review and revision stages: check a beat against its sources, then fix
 * what fails.
 *
 * These exist because groundedness is the promise the pipeline makes and the
 * only stage checking it was the planner. `validateCitations` proves a beat
 * cites real excerpt ids; nothing proved the dialogue written from those
 * excerpts stayed inside them. A confident sentence the sources do not support
 * is indistinguishable from a correct one at every later stage, and it is spoken
 * in the same voice.
 *
 * Three problems are looked for, and they are the three this pipeline actually
 * produces:
 *
 * - **unsupported** — the closed-set promise, broken.
 * - **repeats** — per-beat generation's own failure mode. No call sees another
 *   call's text, so the same explanation can arrive twice in one episode.
 * - **unspeakable** — a URL, a code fragment, or markdown read aloud. Harmless
 *   on a page and gibberish in an ear.
 *
 * Review is per beat, so its input is one beat's turns and one beat's excerpts
 * rather than the whole episode. Revision only runs where review found
 * something, so a clean beat costs one extra call and a clean episode costs
 * nothing to fix.
 */

import type { SourceExcerpt } from "@handbook/content";
import type { LlmPort, StructuredRequest, Usage } from "@handbook/podcast-providers";
import { z } from "zod";
import { BeatScriptSchema } from "./dialogue.ts";
import type { BeatScript } from "./dialogue.ts";
import type { PlannedBeat } from "./schema.ts";

const semanticString = z.string().trim().min(1);

export const FindingSchema = z.object({
  /** Index of the offending turn within this beat, 0-based. */
  turn: z.number().int().nonnegative(),
  problem: z.enum(["unsupported", "repeats", "unspeakable"]),
  /** What is wrong, specifically enough to fix. */
  detail: semanticString,
});

export const ReviewSchema = z.object({
  /** Empty when the beat is fine. That is the expected result. */
  findings: z.array(FindingSchema),
});

export type Finding = z.infer<typeof FindingSchema>;
export type Review = z.infer<typeof ReviewSchema>;

export interface BeatReview {
  beat: number;
  findings: Finding[];
  revised: boolean;
  /**
   * Why a revision was not applied, when findings existed but the fix failed.
   *
   * Distinct from a clean beat and from a revised one: this beat has known
   * problems that are still in it. Without this the manifest would show
   * findings and `revised: false`, which reads exactly like the reviewer having
   * changed its mind.
   */
  revisionRejected?: string;
}

const REVIEW_SYSTEM = [
  "You check one segment of podcast dialogue against the source excerpts it was",
  "written from, and report only what is wrong.",
  "Report `unsupported` when a turn states something the excerpts do not say.",
  "Paraphrase is fine and expected; a claim, number, or name that is not in the",
  "excerpts is not.",
  "Report `repeats` when a turn explains something the earlier segments listed",
  "have already explained.",
  "Report `unspeakable` when a turn contains something that cannot be read",
  "aloud: a URL, a code fragment, markdown, or a bare symbol.",
  "Return an empty list when the segment is fine. Do not invent problems, and",
  "do not report style preferences.",
].join(" ");

const REVISION_SYSTEM = [
  "You rewrite one segment of podcast dialogue to fix the problems listed,",
  "and change nothing else.",
  "Keep the same number of turns, the same speakers in the same order, and the",
  "same length. Keep every sentence that was not complained about.",
  "Fix only what is named: cut an unsupported claim rather than sourcing it,",
  "drop a repeated explanation rather than rephrasing it, and say a URL or",
  "code fragment in words a listener can follow, or remove it.",
].join(" ");

function renderTurns(turns: BeatScript["turns"]): string[] {
  return turns.map((turn, index) => `[${index}] ${turn.speaker}: ${turn.text}`);
}

function renderSources(beat: PlannedBeat, sources: ReadonlyMap<string, SourceExcerpt>): string[] {
  const lines: string[] = [];
  for (const id of beat.excerptIds) {
    const excerpt = sources.get(id);
    if (excerpt) lines.push(`[${id}] ${excerpt.heading}`, excerpt.body, "");
  }
  return lines;
}

export function buildReviewRequest(
  beat: PlannedBeat,
  turns: BeatScript["turns"],
  sources: ReadonlyMap<string, SourceExcerpt>,
  covered: readonly string[],
  maxOutputTokens: number,
): StructuredRequest<Review> {
  const lines = [
    `Segment: ${beat.title}`,
    "",
    "The dialogue, one turn per line:",
    "",
    ...renderTurns(turns),
    "",
    "The only sources this segment may draw on:",
    "",
    ...renderSources(beat, sources),
  ];

  if (covered.length > 0) {
    lines.push(
      "Earlier segments of this episode already covered:",
      ...covered.map((title) => `  - ${title}`),
      "",
    );
  }

  lines.push("Report what is wrong with this segment, or an empty list.");

  return {
    schema: ReviewSchema,
    system: REVIEW_SYSTEM,
    prompt: lines.join("\n"),
    maxOutputTokens,
  };
}

export function buildRevisionRequest(
  beat: PlannedBeat,
  turns: BeatScript["turns"],
  findings: readonly Finding[],
  sources: ReadonlyMap<string, SourceExcerpt>,
  maxOutputTokens: number,
): StructuredRequest<BeatScript> {
  const lines = [
    `Segment: ${beat.title}`,
    "",
    "The dialogue, one turn per line:",
    "",
    ...renderTurns(turns),
    "",
    "Problems to fix:",
    "",
    ...findings.map((finding) => `  turn ${finding.turn} (${finding.problem}): ${finding.detail}`),
    "",
    "The only sources this segment may draw on:",
    "",
    ...renderSources(beat, sources),
    `Return all ${turns.length} turns, with only the problems above fixed.`,
  ];

  return {
    schema: BeatScriptSchema,
    system: REVISION_SYSTEM,
    prompt: lines.join("\n"),
    maxOutputTokens,
  };
}

export interface ReviewResult {
  turns: BeatScript["turns"];
  findings: Finding[];
  revised: boolean;
  /** Set when a revision was attempted and rejected, with the reason. */
  revisionRejected?: string;
  usage: Usage;
}

/**
 * Reviews one beat, and revises it only if the review found something.
 *
 * Every failure here degrades to the unrevised beat rather than to a dead run,
 * and that is the whole disposition of this stage: review is an improvement on
 * a beat that already exists and is already paid for. Losing a fix costs one
 * flaw in one segment; losing the run costs the plan call, every beat written
 * so far, and every review of them.
 *
 * So a finding pointing at a turn that does not exist is dropped, a revision
 * call that throws is swallowed, and a revision that comes back the wrong shape
 * is refused -- each of them keeping the original turns and saying so.
 */
export async function reviewBeat(
  beat: PlannedBeat,
  turns: BeatScript["turns"],
  sources: ReadonlyMap<string, SourceExcerpt>,
  covered: readonly string[],
  llm: LlmPort,
  maxOutputTokens: number,
): Promise<ReviewResult> {
  const review = await llm.generate<Review>(
    buildReviewRequest(beat, turns, sources, covered, maxOutputTokens),
  );

  const findings = review.value.findings.filter((finding) => finding.turn < turns.length);

  if (findings.length === 0) {
    return { turns, findings: [], revised: false, usage: review.usage };
  }

  const unrevised = (reason: string, usage = review.usage): ReviewResult => ({
    turns,
    findings,
    revised: false,
    revisionRejected: reason,
    usage,
  });

  let revision;
  try {
    revision = await llm.generate<BeatScript>(
      buildRevisionRequest(beat, turns, findings, sources, maxOutputTokens),
    );
  } catch (error) {
    // The beat is usable; only the fix was lost. Killing the run here would
    // discard everything spent before it over a call that was optional.
    return unrevised(error instanceof Error ? error.message : String(error));
  }

  // The revision prompt asks for the same turns with only the named problems
  // fixed. A different count means it did something other than the constrained
  // edit -- merged turns, dropped them, invented them -- and accepting that
  // silently changes what the episode says and how long it runs.
  if (revision.value.turns.length !== turns.length) {
    return unrevised(
      `returned ${revision.value.turns.length} turns for a ${turns.length}-turn segment`,
      {
        inputTokens: review.usage.inputTokens + revision.usage.inputTokens,
        outputTokens: review.usage.outputTokens + revision.usage.outputTokens,
        speechCharacters: 0,
      },
    );
  }

  return {
    turns: revision.value.turns,
    findings,
    revised: true,
    usage: {
      inputTokens: review.usage.inputTokens + revision.usage.inputTokens,
      outputTokens: review.usage.outputTokens + revision.usage.outputTokens,
      speechCharacters: 0,
    },
  };
}
