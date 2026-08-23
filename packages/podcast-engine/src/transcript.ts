/**
 * The episode as readable text.
 *
 * `script.json` is the machine artifact and this is the portable one: a person
 * can read it, and another synthesis provider can be handed it. ElevenLabs and
 * Sarvam both take plain text per voice, so the format's one hard requirement
 * is that a reader — human or script — can tell without ambiguity which words
 * belong to which speaker.
 *
 * Hence `**Host:**` and `**Guest:**` at the start of a line and nowhere else,
 * one turn per paragraph, no wrapping. It reads as Markdown and greps as data:
 * `grep '^\*\*Guest:\*\*' transcript.md` is the guest's script.
 *
 * The header records what produced the audio, because a transcript that
 * outlives its run directory is otherwise a wall of dialogue nobody can source.
 */

import type { DialogueScript } from "./dialogue.ts";
import type { EpisodePlan } from "./schema.ts";

export interface TranscriptMeta {
  documentId: string;
  /** Site path of the page the episode was made from. */
  url: string;
  modelId: string;
  /** ISO date. */
  generated: string;
  voices: { host: string; guest: string };
  /** Measured from the rendered audio. Null when it could not be measured. */
  audioSeconds: number | null;
}

function runtime(seconds: number | null): string {
  if (seconds === null) return "unmeasured";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const SPEAKER: Record<string, string> = { host: "Host", guest: "Guest" };

/**
 * Spoken words, escaped so Markdown renders them and does not interpret them.
 *
 * A guest explaining Python said `__del__`, and the page showed a bold **del**:
 * the transcript is a record of speech, so anything that looks like formatting
 * is a coincidence of the vocabulary, never an instruction. Prettier made the
 * same mistake on the same word, which is why these files are unformatted.
 *
 * Escapes every delimiter rather than guessing intent from position. Across the
 * first sixty-two episodes this touches four characters in total -- the cost in
 * readability is nil, and a consumer feeding the text to another synthesiser
 * strips backslashes with one substitution.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<]/g, (character) => `\\${character}`);
}

export function renderTranscript(
  plan: EpisodePlan,
  script: DialogueScript,
  meta: TranscriptMeta,
): string {
  const lines = [
    `# ${escapeMarkdown(plan.title)}`,
    "",
    `_${escapeMarkdown(plan.throughLine)}_`,
    "",
    `- **Source:** [${meta.documentId}](${meta.url})`,
    `- **Runtime:** ${runtime(meta.audioSeconds)} · ${script.turns.length} turns · ${plan.beats.length} beats`,
    `- **Written by:** ${meta.modelId} on ${meta.generated}`,
    `- **Voices:** ${meta.voices.host} (host), ${meta.voices.guest} (guest)`,
    "",
    "> Generated from the page above and spoken by a local text-to-speech model.",
    "> Two synthetic voices, not a recorded conversation. Where this differs from",
    "> the page, the page is correct.",
    "",
  ];

  plan.beats.forEach((beat, index) => {
    const turns = script.turns.filter((turn) => turn.beat === index + 1);
    // A beat with no turns is skipped rather than printed empty: the heading
    // would promise a segment the episode does not contain.
    if (turns.length === 0) return;

    lines.push("---", "", `## ${index + 1}. ${escapeMarkdown(beat.title)}`, "");
    for (const turn of turns) {
      lines.push(`**${SPEAKER[turn.speaker] ?? turn.speaker}:** ${escapeMarkdown(turn.text)}`, "");
    }
  });

  if (plan.unsupported.length > 0) {
    lines.push(
      "---",
      "",
      "## Not covered",
      "",
      "The planner wanted these and found nothing in the source to support them:",
      "",
      ...plan.unsupported.map((gap) => `- ${escapeMarkdown(gap)}`),
      "",
    );
  }

  return lines.join("\n");
}
