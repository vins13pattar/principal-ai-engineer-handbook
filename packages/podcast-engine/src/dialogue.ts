/**
 * The dialogue stage: an episode plan in, a two-speaker script out.
 *
 * One model call per beat, which is the second design. The first asked for the
 * whole episode at once, on the reasoning that a single call cannot contradict
 * itself. It could not be bounded: output length varied enormously run to run
 * for an identical request -- one call returned 4,861 characters and the next
 * tried to write six times its budget -- and two of six real runs died on
 * truncation, each costing a full pair of calls for nothing.
 *
 * Per beat, the cap is per beat. A runaway damages one segment instead of the
 * run, and the input shrinks too: a beat needs the excerpts it cites, not the
 * whole 24,500-token pack, so five small calls cost less to send than one
 * large one.
 *
 * Continuity is bought back explicitly. Each call sees the episode's shape, the
 * beats already covered, and the last thing said -- which is what stops a guest
 * introducing themselves three times.
 *
 * The stage owns one number the plan does not: how many characters of speech a
 * beat's seconds are worth. That conversion is `charsPerSecond`, measured on
 * this machine, and it is the only thing standing between "a 5-minute episode"
 * and a script that renders to ninety seconds.
 */

import type { SourceExcerpt, SourcePack } from "@handbook/content";
import { ZERO_USAGE, addUsage } from "@handbook/podcast-providers";
import type { LlmPort, StructuredRequest, Usage } from "@handbook/podcast-providers";
import { z } from "zod";
import { deriveExcerptIds } from "./ids.ts";
import { reviewBeat } from "./review.ts";
import type { BeatReview } from "./review.ts";
import type { EpisodePlan, PlannedBeat } from "./schema.ts";

const semanticString = z.string().trim().min(1);

/**
 * What the model returns for one beat.
 *
 * No beat number: the caller knows which beat it asked for, so stamping the
 * answer is both cheaper and correct by construction. Asking the model to tag
 * its own turns -- the previous design -- made a labelling mistake able to
 * distort the trim.
 */
export const BeatTurnSchema = z.object({
  speaker: z.enum(["host", "guest"]),
  /** What this speaker says. Rendered verbatim; no stage directions. */
  text: semanticString,
});

export const BeatScriptSchema = z.object({
  turns: z.array(BeatTurnSchema).min(1),
});

export type BeatScript = z.infer<typeof BeatScriptSchema>;

/** A turn, once the engine has stamped it with the beat it was written for. */
export interface DialogueTurn {
  speaker: "host" | "guest";
  /** 1-based, assigned by the engine rather than the model. */
  beat: number;
  text: string;
}

export interface DialogueScript {
  turns: DialogueTurn[];
}

export interface DialogueResult {
  script: DialogueScript;
  usage: Usage;
  modelId: string;
  /** One entry per beat that was reviewed. Empty when review is off. */
  reviews: BeatReview[];
}

export interface DialogueOptions {
  /** Measured, from the TTS profile. Converts a beat's seconds into characters. */
  charsPerSecond: number;
  /** Ceiling per call. A beat asks for less than this unless it is very long. */
  maxOutputTokens: number;
  /**
   * Check each beat against its sources, and fix what fails.
   *
   * On by default: groundedness is the promise this pipeline makes, and an
   * unsupported claim is spoken in the same confident voice as a correct one.
   * Turn it off to halve the call count when the script does not matter --
   * a smoke test of the synthesis path, say.
   */
  review?: boolean;
  /** Called after each beat is reviewed, so a long run is not a silent wait. */
  onReview?: (review: BeatReview) => void;
}

const SYSTEM = [
  "You write two-person podcast dialogue from an approved episode plan.",
  "You are writing one segment of a longer episode, and you are told what has",
  "already been covered: do not re-introduce the show, the speakers, or a topic",
  "that an earlier segment has already handled.",
  "The host drives: they ask and steer. The guest explains. Neither narrates",
  "stage directions, reads headings aloud, nor says anything the excerpts do",
  "not support.",
  "Write only what is spoken. No speaker labels inside `text`, no markdown,",
  "no bracketed sound cues, no URLs read aloud.",
  "Write the number of turns you are asked for, each two or three sentences.",
].join(" ");

/**
 * Characters one turn of two-or-three sentences actually comes to.
 *
 * Measured, not assumed: real episodes came back at 301, 326 and 324
 * characters per turn. 300 is the round number inside that range.
 */
export const CHARACTERS_PER_TURN = 300;

/**
 * Converts a character budget into a turn count.
 *
 * Turns are what the model is asked for, because character budgets do not
 * work: runs given one overran it by 48%, 57% and 96%, the last of them after
 * being told a ten-percent tolerance. A model cannot count the characters it
 * is emitting. It is not reliable at stopping on a turn count either -- that
 * is what `trimToBudget` is for -- but a countable unit at least gets close.
 */
export function turnsForCharacters(characters: number): number {
  return Math.max(1, Math.round(characters / CHARACTERS_PER_TURN));
}

/**
 * Four characters per token, matching `estimateTokens`, plus a third again for
 * JSON scaffolding: every turn costs a `{"speaker":"host","text":"..."}`
 * wrapper and escaped punctuation on top of the prose.
 */
export function projectOutputTokens(characters: number): number {
  return Math.ceil((characters / 4) * 1.35);
}

/**
 * The output ceiling for one beat's call.
 *
 * Deliberately far above any plausible length. A cap that truncates destroys
 * the whole response and everything spent reaching it, so it is not a budget --
 * it is a backstop against one runaway beat consuming an episode's worth of
 * tokens, and it belongs nowhere near the expected size.
 *
 * Six times the projection was not enough: a 60-second beat projected 293
 * tokens, was capped at 1,884, and the model wanted more. Twelve times fixed
 * that.
 *
 * The floor moved from 4,000 to 8,000 after a short beat on a dense page --
 * `architecture:policy-gated-tool-execution`, beat 7 of 9 -- hit 4,000 and lost
 * the whole episode at the last page of a 62-page series. Short beats are
 * exactly where the floor governs and the projection does not, so the floor has
 * to clear a dense beat too, not merely a brief one.
 */
export function beatOutputTokens(characters: number, configured: number): number {
  return Math.min(configured, Math.max(8000, projectOutputTokens(characters) * 12));
}

/**
 * A dialogue with one speaker is a monologue that passed a two-speaker schema.
 *
 * Checked across the finished script rather than per beat: a single beat can
 * legitimately be one speaker answering at length, but an episode where only
 * one voice ever speaks is a two-voice episode that is not.
 */
export function validateSpeakers(script: DialogueScript): void {
  const speakers = new Set(script.turns.map((turn) => turn.speaker));
  if (speakers.size < 2) {
    throw new Error(
      `the script has ${script.turns.length} turn(s) but only the ${[...speakers].join("")} speaks; ` +
        "a two-voice episode needs both",
    );
  }
}

export function excerptsById(pack: SourcePack): Map<string, SourceExcerpt> {
  const ids = deriveExcerptIds(pack.excerpts);
  const map = new Map<string, SourceExcerpt>();
  ids.forEach((id, position) => {
    const excerpt = pack.excerpts[position];
    if (excerpt) map.set(id, excerpt);
  });
  return map;
}

export interface BeatContext {
  /** Titles of the beats already written, in order. Empty for the first. */
  covered: string[];
  /** The final turn of the previous beat, so this one can pick up from it. */
  previous: DialogueTurn | undefined;
}

export function renderBeatPrompt(
  plan: EpisodePlan,
  beat: PlannedBeat,
  position: number,
  sources: ReadonlyMap<string, SourceExcerpt>,
  charsPerSecond: number,
  context: BeatContext,
): string {
  const characters = Math.round(beat.targetSeconds * charsPerSecond);
  const turns = turnsForCharacters(characters);

  const lines = [
    `Episode: ${plan.title}`,
    `Through-line: ${plan.throughLine}`,
    `This is segment ${position + 1} of ${plan.beats.length}.`,
    "",
  ];

  if (context.covered.length > 0) {
    lines.push("Already covered, do not repeat:", ...context.covered.map((t) => `  - ${t}`), "");
  } else {
    lines.push("This is the opening segment: the host sets the episode up here.", "");
  }

  if (context.previous) {
    lines.push(
      `The previous segment ended with the ${context.previous.speaker} saying:`,
      context.previous.text,
      "",
    );
  }

  lines.push(
    `Segment: ${beat.title}`,
    `Intent: ${beat.intent}`,
    `Write ${turns} turn${turns === 1 ? "" : "s"}, alternating host and guest.`,
    "",
    "Source material for this segment:",
    "",
  );

  for (const id of beat.excerptIds) {
    const excerpt = sources.get(id);
    if (excerpt) lines.push(`[${id}] ${excerpt.heading}`, excerpt.body, "");
  }

  if (position === plan.beats.length - 1) {
    lines.push("This is the final segment: close the episode here.", "");
  }

  lines.push(`Write the dialogue for this segment only, in ${turns} turns.`);
  return lines.join("\n");
}

export function buildBeatRequest(
  plan: EpisodePlan,
  beat: PlannedBeat,
  position: number,
  pack: SourcePack,
  options: DialogueOptions,
  context: BeatContext,
): StructuredRequest<BeatScript> {
  const characters = Math.round(beat.targetSeconds * options.charsPerSecond);

  return {
    schema: BeatScriptSchema,
    system: SYSTEM,
    prompt: renderBeatPrompt(
      plan,
      beat,
      position,
      excerptsById(pack),
      options.charsPerSecond,
      context,
    ),
    maxOutputTokens: beatOutputTokens(characters, options.maxOutputTokens),
  };
}

/** Characters of speech the script will submit for synthesis. */
export function scriptCharacters(script: DialogueScript): number {
  return script.turns.reduce((total, turn) => total + turn.text.length, 0);
}

export async function writeDialogue(
  plan: EpisodePlan,
  pack: SourcePack,
  llm: LlmPort,
  options: DialogueOptions,
): Promise<DialogueResult> {
  const turns: DialogueTurn[] = [];
  const reviews: BeatReview[] = [];
  const sources = excerptsById(pack);
  let usage = ZERO_USAGE;
  let modelId = llm.name;

  for (const [position, beat] of plan.beats.entries()) {
    const covered = plan.beats.slice(0, position).map((earlier) => earlier.title);
    const context: BeatContext = { covered, previous: turns[turns.length - 1] };

    let written: BeatScript["turns"];
    try {
      const result = await llm.generate<BeatScript>(
        buildBeatRequest(plan, beat, position, pack, options, context),
      );
      usage = addUsage(usage, result.usage);
      modelId = result.modelId;
      written = result.value.turns;

      // Reviewed inside the loop rather than over the finished script, so the
      // next beat's continuity context is the corrected text. Reviewing at the
      // end would leave every later beat built on a turn that was wrong.
      if (options.review !== false) {
        const reviewed = await reviewBeat(
          beat,
          written,
          sources,
          covered,
          llm,
          options.maxOutputTokens,
        );

        usage = addUsage(usage, reviewed.usage);
        written = reviewed.turns;

        const record: BeatReview = {
          beat: position + 1,
          findings: reviewed.findings,
          revised: reviewed.revised,
          droppedFindings: reviewed.droppedFindings,
          ...(reviewed.revisionRejected === undefined
            ? {}
            : { revisionRejected: reviewed.revisionRejected }),
          ...(reviewed.reviewFailed === undefined ? {} : { reviewFailed: reviewed.reviewFailed }),
        };
        reviews.push(record);
        options.onReview?.(record);
      }
    } catch (error) {
      // Naming the beat matters: with one call per beat, "the dialogue stage
      // failed" no longer says which part of the episode to look at.
      throw new Error(
        `beat ${position + 1} of ${plan.beats.length} ("${beat.title}") failed: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    for (const turn of written) {
      turns.push({ speaker: turn.speaker, beat: position + 1, text: turn.text });
    }
  }

  const script: DialogueScript = { turns };
  validateSpeakers(script);

  return { script, usage, modelId, reviews };
}
