/**
 * The synthesis and assembly stages: a script in, one playable file out.
 *
 * Turns are rendered one at a time on purpose. The local runner loads the model
 * per call and holds it in memory for the duration; two of them in parallel on
 * a 24 GB machine trade a little wall-clock for the risk of swapping, and the
 * measured cost model (`projectRenderSeconds`) assumes serial calls anyway.
 *
 * Every turn's measured duration is kept rather than summed and discarded. The
 * planner budgeted seconds per beat from an assumed `charsPerSecond`; comparing
 * what it asked for against what the voice actually produced is the only way
 * that assumption ever gets corrected.
 */

import {
  ZERO_USAGE,
  addUsage,
  concatenateWav,
  wavDurationSeconds,
} from "@handbook/podcast-providers";
import type { LanguageTag, TtsPort, Usage } from "@handbook/podcast-providers";
import type { DialogueScript, DialogueTurn } from "./dialogue.ts";

export interface VoiceCast {
  host: string;
  guest: string;
}

export interface RenderedTurn {
  speaker: DialogueTurn["speaker"];
  voice: string;
  characters: number;
  /** Null when the provider returned audio this build cannot measure. */
  audioSeconds: number | null;
  elapsedSeconds: number;
}

export interface EpisodeAudio {
  audio: Uint8Array;
  mediaType: string;
  turns: RenderedTurn[];
  usage: Usage;
  /** Sum of the measured turns. Null if any turn could not be measured. */
  audioSeconds: number | null;
  /** Wall clock actually spent in the provider. */
  elapsedSeconds: number;
}

export interface RenderOptions {
  voices: VoiceCast;
  language: LanguageTag;
  /** Called before each turn, so a multi-minute render is not a silent wait. */
  onTurn?: (index: number, total: number, speaker: DialogueTurn["speaker"]) => void;
}

export async function renderEpisode(
  script: DialogueScript,
  tts: TtsPort,
  options: RenderOptions,
): Promise<EpisodeAudio> {
  const parts: Uint8Array[] = [];
  const turns: RenderedTurn[] = [];
  let usage = ZERO_USAGE;
  let elapsedSeconds = 0;
  let mediaType: string | undefined;

  for (const [index, turn] of script.turns.entries()) {
    options.onTurn?.(index, script.turns.length, turn.speaker);

    const voice = options.voices[turn.speaker];
    const result = await tts.synthesise({ text: turn.text, voice, language: options.language });

    // A provider that changes format mid-episode would otherwise be caught by
    // `concatenateWav` with a message about audio formats, which is true but
    // names the wrong culprit.
    if (mediaType === undefined) {
      mediaType = result.mediaType;
    } else if (result.mediaType !== mediaType) {
      throw new Error(
        `turn ${index} came back as ${result.mediaType} after ${mediaType}; ` +
          "the provider changed format mid-episode",
      );
    }

    parts.push(result.audio);
    usage = addUsage(usage, result.usage);
    elapsedSeconds += result.elapsedSeconds;
    turns.push({
      speaker: turn.speaker,
      voice,
      characters: turn.text.length,
      audioSeconds: wavDurationSeconds(result.audio),
      elapsedSeconds: result.elapsedSeconds,
    });
  }

  if (mediaType !== "audio/wav") {
    throw new Error(
      `assembly can only join wav today, and the provider returned ${mediaType}. ` +
        "Set the runner's mediaType, or have it write wav.",
    );
  }

  const measured = turns.map((turn) => turn.audioSeconds);

  return {
    audio: concatenateWav(parts),
    mediaType,
    turns,
    usage,
    audioSeconds: measured.includes(null)
      ? null
      : measured.reduce((total: number, seconds) => total + (seconds ?? 0), 0),
    elapsedSeconds,
  };
}
