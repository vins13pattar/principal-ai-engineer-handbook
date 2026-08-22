/**
 * The create pipeline: a source pack in, a playable episode on disk.
 *
 * Three stages, each writing its artifact before the next begins. That ordering
 * is the whole design: synthesis is the stage that takes minutes, and a
 * synthesis failure that also loses the script would make the expensive half of
 * the run unrepeatable. `plan.json` and `script.json` are on disk before the
 * first voice is loaded.
 *
 * Every stage reports what it spent as it finishes, rather than returning a
 * total at the end. A run that dies in synthesis has still spent real money on
 * two model calls, and a manifest that records zero because the pipeline threw
 * is a manifest that lies about the bill.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SourcePack } from "@handbook/content";
import type { LlmPort, TtsPort, Usage } from "@handbook/podcast-providers";
import type { PodcastConfig } from "./config.ts";
import { scriptCharacters, writeDialogue } from "./dialogue.ts";
import type { DialogueScript } from "./dialogue.ts";
import { renderEpisode } from "./episode.ts";
import type { BeatReview } from "./review.ts";
import type { EpisodeAudio } from "./episode.ts";
import { planEpisode } from "./plan.ts";
import { renderTranscript } from "./transcript.ts";
import type { EpisodePlan } from "./schema.ts";

export type CreateStage = "plan" | "dialogue" | "synthesis";

export interface StageReport {
  /** Spent by this stage. Absent for synthesis on a local provider's model id. */
  usage?: Usage;
  modelId?: string;
  artifact?: string;
}

export interface CreateOptions {
  pack: SourcePack;
  config: PodcastConfig;
  durationSeconds: number;
  /** Check each beat against its sources. On unless the operator opts out. */
  review: boolean;
  /** ISO date, for the transcript header. Injected so the run stays testable. */
  generated: string;
  llm: LlmPort;
  tts: TtsPort;
  directory: string;
  /** Called when a stage begins, so a failure can name where it happened. */
  onStageStart: (stage: CreateStage) => void;
  /** Called when a stage finishes, with what it spent and what it wrote. */
  onStageDone: (stage: CreateStage, report: StageReport) => void;
  /**
   * Called as each beat is reviewed.
   *
   * The caller needs these as they happen, not in the return value: a run that
   * dies in synthesis has already paid for every review before it, and a
   * failure manifest built from a result that never arrived would record none
   * of them.
   */
  onReview?: (review: BeatReview) => void;
  log: (line: string) => void;
}

export interface CreateResult {
  plan: EpisodePlan;
  /** The script, every turn of which is spoken. */
  script: DialogueScript;
  /** One entry per reviewed beat. Empty when review was skipped. */
  reviews: BeatReview[];
  episode: EpisodeAudio;
}

export const EPISODE_FILE = "episode.wav";
/** The episode as readable text, for a person or another voice provider. */
export const TRANSCRIPT_FILE = "transcript.md";

export async function createEpisode(options: CreateOptions): Promise<CreateResult> {
  const { config, directory } = options;

  options.onStageStart("plan");
  const planned = await planEpisode(
    options.pack,
    {
      requestedSeconds: options.durationSeconds,
      expansionFactor: config.plan.expansionFactor,
      charsPerSecond: config.tts.charsPerSecond,
      maxRenderSeconds: config.plan.maxRenderSeconds,
      synthesisCost: config.tts.synthesisCost,
    },
    options.llm,
    { maxOutputTokens: config.llm.maxOutputTokens },
  );

  await writeFile(join(directory, "plan.json"), `${JSON.stringify(planned.plan, null, 2)}\n`);
  options.onStageDone("plan", {
    usage: planned.usage,
    modelId: planned.modelId,
    artifact: "plan.json",
  });
  options.log(
    `  planned         ${planned.plan.beats.length} beats, ${Math.round(planned.plan.plannedSeconds)}s of speech`,
  );

  options.onStageStart("dialogue");
  const written = await writeDialogue(planned.plan, options.pack, options.llm, {
    charsPerSecond: config.tts.charsPerSecond,
    maxOutputTokens: config.llm.maxOutputTokens,
    review: options.review,
    onReview: (review) => {
      const problems = review.findings.map((finding) => finding.problem).join(", ");
      // "clean" is reserved for a beat that was actually checked and passed.
      // A review that could not run, or whose findings all pointed at turns
      // the beat does not have, is not the same claim.
      const summary = review.reviewFailed
        ? `NOT CHECKED (${review.reviewFailed})`
        : review.findings.length === 0
          ? review.droppedFindings > 0
            ? `${review.droppedFindings} finding(s) discarded as out of range — not checked`
            : "clean"
          : review.revised
            ? `${problems} — revised`
            : `${problems} — NOT fixed (${review.revisionRejected})`;
      options.log(`  reviewed        beat ${review.beat}: ${summary}`);
      options.onReview?.(review);
    },
  });

  await writeFile(join(directory, "script.json"), `${JSON.stringify(written.script, null, 2)}\n`);

  // Written here as well as after synthesis, and the duplication is the point.
  // The words are the expensive half; synthesis is free and repeatable. A run
  // that dies rendering audio should still leave a transcript somebody can hand
  // to another voice provider, so the readable artifact exists as soon as the
  // conversation does. The second write only fills in the measured runtime.
  const transcript = (audioSeconds: number | null) =>
    renderTranscript(planned.plan, written.script, {
      documentId: options.pack.primary.documentId,
      url: options.pack.primary.url,
      modelId: written.modelId,
      generated: options.generated,
      voices: config.tts.voices,
      audioSeconds,
    });

  await writeFile(join(directory, TRANSCRIPT_FILE), transcript(null));

  options.onStageDone("dialogue", {
    usage: written.usage,
    modelId: written.modelId,
    artifact: "script.json",
  });
  options.onStageDone("dialogue", { artifact: TRANSCRIPT_FILE });
  // Printed as a comparison rather than a count. The first real run came back
  // 48% over budget, and nothing said so until the finished audio turned out
  // to be eight and a half minutes against a five-minute request -- by which
  // point both model calls and two minutes of synthesis were already spent.
  const budgeted = Math.round(planned.plan.plannedSeconds * config.tts.charsPerSecond);
  const characters = scriptCharacters(written.script);
  const overBy = Math.round((characters / budgeted - 1) * 100);
  options.log(
    `  script          ${written.script.turns.length} turns, ${characters} chars vs ${budgeted} budgeted ` +
      `(${overBy >= 0 ? "+" : ""}${overBy}%)`,
  );

  // Every turn is spoken. There was a trim here that cut the script back to the
  // duration budget, and it ended an episode on the host asking "so where's the
  // cost hiding?" with the guest's answer amputated -- because cutting per beat
  // takes the last turns of the last beat, which is the close.
  //
  // The budget is guidance for the writer, not a blade for the renderer. A
  // conversation that ends mid-exchange is broken in a way no duration target
  // is worth; the beats already carry turn counts, so length is shaped where it
  // can be shaped well.
  options.onStageStart("synthesis");
  const episode = await renderEpisode(written.script, options.tts, {
    voices: config.tts.voices,
    language: config.tts.language,
    onTurn: (index, total, speaker) => {
      options.log(`  synthesising    turn ${index + 1}/${total} (${speaker})`);
    },
  });

  await writeFile(join(directory, EPISODE_FILE), episode.audio);
  // Rewritten now that the runtime is measured rather than guessed.
  await writeFile(join(directory, TRANSCRIPT_FILE), transcript(episode.audioSeconds));
  options.onStageDone("synthesis", { usage: episode.usage, artifact: EPISODE_FILE });

  return {
    plan: planned.plan,
    script: written.script,
    reviews: written.reviews,
    episode,
  };
}
