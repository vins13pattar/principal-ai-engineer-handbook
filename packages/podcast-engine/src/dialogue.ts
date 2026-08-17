/**
 * The dialogue stage: an episode plan in, a two-speaker script out.
 *
 * One model call, like the plan stage, and for the same reason: the planner
 * already decided the arc, the citations, and how many seconds each beat gets.
 * Asking a second model call per beat would buy continuity problems -- a guest
 * who introduces themselves three times -- in exchange for latency.
 *
 * The stage owns one number the plan does not: how many characters of speech a
 * beat's seconds are worth. That conversion is `charsPerSecond`, measured on
 * this machine, and it is the only thing standing between "a 5-minute episode"
 * and a script that renders to ninety seconds.
 */

import type { SourceExcerpt, SourcePack } from "@handbook/content";
import type { LlmPort, StructuredRequest, Usage } from "@handbook/podcast-providers";
import { z } from "zod";
import { deriveExcerptIds } from "./ids.ts";
import type { EpisodePlan } from "./schema.ts";

const semanticString = z.string().trim().min(1);

export const DialogueTurnSchema = z.object({
  speaker: z.enum(["host", "guest"]),
  /** What this speaker says. Rendered verbatim; no stage directions. */
  text: semanticString,
});

export const DialogueScriptSchema = z.object({
  turns: z.array(DialogueTurnSchema).min(2),
});

export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;
export type DialogueScript = z.infer<typeof DialogueScriptSchema>;

export interface DialogueResult {
  script: DialogueScript;
  usage: Usage;
  modelId: string;
}

export interface DialogueOptions {
  /** Measured, from the TTS profile. Converts a beat's seconds into characters. */
  charsPerSecond: number;
  maxOutputTokens: number;
}

const SYSTEM = [
  "You write two-person podcast dialogue from an approved episode plan.",
  "The host drives: they introduce the topic, ask, and close. The guest",
  "explains. Neither narrates stage directions, reads headings aloud, nor",
  "says anything the excerpts do not support.",
  "Write only what is spoken. No speaker labels inside `text`, no markdown,",
  "no bracketed sound cues, no URLs read aloud.",
  "Cover the beats in the order given, and write the number of turns each beat",
  "asks for -- no more. Keep every turn to two or three sentences; if a point",
  "needs more room, cut the point rather than extending the turn.",
  "Length is a requirement, not a suggestion: the operator asked for an episode",
  "of a particular duration, and turns are how it is measured.",
].join(" ");

/**
 * Characters one turn of two-or-three sentences actually comes to.
 *
 * Measured, not assumed: two real episodes came back at 301 and 326 characters
 * per turn across 44 turns. 300 is the round number inside that range.
 */
export const CHARACTERS_PER_TURN = 300;

/**
 * Converts a character budget into a turn count.
 *
 * This exists because character budgets do not work. Two runs were given one
 * and overran it by 48% and 57%; the second run was even told to stay within
 * ten percent. A model cannot count the characters it is emitting, so a
 * character budget is a number it can read and not a constraint it can apply.
 * Turns and sentences it can count while writing.
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
 * Refuses a script the token bound cannot hold, before the call rather than
 * after it.
 *
 * Without this the failure is a truncated JSON response, which surfaces as a
 * schema error naming a parse position -- an error about the model's output
 * when the actual fault is a duration and a bound that were never compatible.
 */
export function assertDialogueFits(
  characters: number,
  maxOutputTokens: number,
  plannedSeconds: number,
): void {
  const needed = projectOutputTokens(characters);
  if (needed <= maxOutputTokens) return;

  throw new Error(
    `a ${Math.round(plannedSeconds)}s episode needs about ${needed} output tokens ` +
      `(~${characters} characters of speech) but llm.maxOutputTokens is ${maxOutputTokens}. ` +
      "Raise maxOutputTokens, or ask for a shorter --duration.",
  );
}

/**
 * A dialogue with one speaker is a monologue that passed a two-speaker schema.
 *
 * `turns.min(2)` does not catch it: two host turns satisfy it. This is checked
 * after generation for the same reason `validateCitations` is -- shape
 * validation cannot tell a cast of two from a cast of one.
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

export function renderDialoguePrompt(
  plan: EpisodePlan,
  sources: ReadonlyMap<string, SourceExcerpt>,
  charsPerSecond: number,
): string {
  const totalTurns = plan.beats.reduce(
    (total, beat) => total + turnsForCharacters(Math.round(beat.targetSeconds * charsPerSecond)),
    0,
  );

  const lines = [
    `Episode title: ${plan.title}`,
    `Through-line: ${plan.throughLine}`,
    `Total length: ${totalTurns} turns, alternating host and guest, ` +
      `which comes to about ${Math.round(plan.plannedSeconds)} seconds of speech. ` +
      "Two or three sentences per turn.",
    "",
    "Beats, in order:",
    "",
  ];

  plan.beats.forEach((beat, index) => {
    const characters = Math.round(beat.targetSeconds * charsPerSecond);
    const turns = turnsForCharacters(characters);
    lines.push(
      `Beat ${index + 1}: ${beat.title}`,
      `  Intent: ${beat.intent}`,
      `  Write ${turns} turn${turns === 1 ? "" : "s"} for this beat (~${Math.round(beat.targetSeconds)}s).`,
      "  Source material:",
    );

    for (const id of beat.excerptIds) {
      const excerpt = sources.get(id);
      // A beat citing an id the pack does not hold cannot happen -- the plan
      // stage validates citations -- but printing nothing beats printing
      // "undefined" into a prompt if that ever changes.
      if (excerpt) lines.push(`  [${id}] ${excerpt.heading}`, excerpt.body, "");
    }

    lines.push("");
  });

  if (plan.unsupported.length > 0) {
    lines.push(
      "The planner wanted these and found no source for them. Do not write them:",
      ...plan.unsupported.map((gap) => `  - ${gap}`),
      "",
    );
  }

  lines.push("Write the dialogue for these beats, using only this material.");
  return lines.join("\n");
}

export function buildDialogueRequest(
  plan: EpisodePlan,
  pack: SourcePack,
  options: DialogueOptions,
): StructuredRequest<DialogueScript> {
  return {
    schema: DialogueScriptSchema,
    system: SYSTEM,
    prompt: renderDialoguePrompt(plan, excerptsById(pack), options.charsPerSecond),
    maxOutputTokens: options.maxOutputTokens,
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
  assertDialogueFits(
    Math.round(plan.plannedSeconds * options.charsPerSecond),
    options.maxOutputTokens,
    plan.plannedSeconds,
  );

  const result = await llm.generate<DialogueScript>(buildDialogueRequest(plan, pack, options));
  validateSpeakers(result.value);

  return { script: result.value, usage: result.usage, modelId: result.modelId };
}
