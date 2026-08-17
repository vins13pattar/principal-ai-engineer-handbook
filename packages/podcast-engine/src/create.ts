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
import type { EpisodeAudio } from "./episode.ts";
import { planEpisode } from "./plan.ts";
import type { EpisodePlan } from "./schema.ts";
import { trimToBudget } from "./trim.ts";
import type { TrimResult } from "./trim.ts";

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
  llm: LlmPort;
  tts: TtsPort;
  directory: string;
  /** Called when a stage begins, so a failure can name where it happened. */
  onStageStart: (stage: CreateStage) => void;
  /** Called when a stage finishes, with what it spent and what it wrote. */
  onStageDone: (stage: CreateStage, report: StageReport) => void;
  log: (line: string) => void;
}

export interface CreateResult {
  plan: EpisodePlan;
  /** What the model wrote, before any cut. */
  script: DialogueScript;
  /** What was spoken, and which turns of `script` were left out. */
  rendered: TrimResult;
  episode: EpisodeAudio;
}

export const EPISODE_FILE = "episode.wav";

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
  });

  await writeFile(join(directory, "script.json"), `${JSON.stringify(written.script, null, 2)}\n`);
  options.onStageDone("dialogue", {
    usage: written.usage,
    modelId: written.modelId,
    artifact: "script.json",
  });
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

  // `script.json` above is what the model wrote; this is what gets spoken. The
  // two are kept separate so a trim is auditable rather than invisible -- the
  // dropped turns are named in the manifest, not quietly absent.
  const trimmed = trimToBudget(written.script, planned.plan, config.tts.charsPerSecond);
  if (trimmed.dropped.length > 0) {
    options.log(
      `  trimmed         ${trimmed.dropped.length} turn(s) cut, ${trimmed.charactersAfter} chars rendered ` +
        `(asked for ${budgeted})`,
    );
  }

  options.onStageStart("synthesis");
  const episode = await renderEpisode(trimmed.script, options.tts, {
    voices: config.tts.voices,
    language: config.tts.language,
    onTurn: (index, total, speaker) => {
      options.log(`  synthesising    turn ${index + 1}/${total} (${speaker})`);
    },
  });

  await writeFile(join(directory, EPISODE_FILE), episode.audio);
  options.onStageDone("synthesis", { usage: episode.usage, artifact: EPISODE_FILE });

  return { plan: planned.plan, script: written.script, rendered: trimmed, episode };
}
