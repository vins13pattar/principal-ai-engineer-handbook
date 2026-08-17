/**
 * A local TTS model as a `TtsPort`.
 *
 * This is the third kind of adapter and the one that validates the port design:
 * hosted-via-SDK (`ai-sdk.ts`), hosted-via-REST (`sarvam.ts`), and a subprocess
 * on your own machine. The engine cannot tell them apart.
 *
 * It matters more than architectural tidiness. Speech is **87% of a clean
 * episode's cost** at premium voice pricing (see `cost.ts`), so moving
 * synthesis local does not shave the bill — it removes the majority of it, and
 * turns the remaining question into one about LLM spend on a much smaller
 * number. That is the real answer to "which gateway is cost-effective": once
 * TTS is local, the gateway is deciding the minority of a small number.
 *
 * Deliberately generic rather than bound to one model. The local TTS field
 * moves fast enough that hardcoding a runner would date this file within
 * months; a command template outlives the model choice.
 */

import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpeechRequest, TtsPort, TtsResult } from "./ports.ts";
import { readWavChunks } from "./wav.ts";

export interface LocalTtsOptions {
  /** Display name, e.g. "kokoro-82m". */
  name: string;
  /** Executable to run, e.g. "uv" or "python3". */
  command: string;
  /**
   * Argument template. These placeholders are substituted:
   * `{text}`, `{voice}`, `{language}`, `{speed}`, `{out}`.
   *
   * Passed as an argv array and never through a shell, so text containing
   * quotes, backticks, or semicolons cannot become a command.
   */
  args: string[];
  /** Media type the command writes. Assembly must not guess. */
  mediaType?: string;
  /** Kill the process after this many seconds. */
  timeoutSeconds?: number;
  cwd?: string;
}

export function createLocalTts(options: LocalTtsOptions): TtsPort {
  const mediaType = options.mediaType ?? "audio/wav";
  const timeoutSeconds = options.timeoutSeconds ?? 600;

  return {
    name: `local:${options.name}`,
    async synthesise(request: SpeechRequest): Promise<TtsResult> {
      const dir = await mkdtemp(join(tmpdir(), "handbook-tts-"));
      const outPath = join(dir, "out");
      const started = Date.now();

      try {
        const args = options.args.map((arg) =>
          arg
            .replaceAll("{text}", request.text)
            .replaceAll("{voice}", request.voice)
            .replaceAll("{language}", request.language)
            .replaceAll("{speed}", String(request.speed ?? 1))
            .replaceAll("{out}", outPath),
        );

        await run(options.command, args, timeoutSeconds, options.cwd);

        // A runner that exits 0 and produces nothing is the failure that would
        // otherwise append silence and yield a short episode with no error.
        // Both shapes of it -- no file, or an empty file -- have to say the
        // same thing, or the message is an ENOENT with a temp path in it.
        let audio: Buffer;
        try {
          audio = await readFile(outPath);
        } catch {
          throw new Error(
            `${options.name} exited 0 but wrote no output file. ` +
              `Check that its arguments put the audio at {out}.`,
          );
        }
        if (audio.length === 0) {
          throw new Error(`${options.name} exited 0 but wrote an empty output file`);
        }

        return {
          audio: new Uint8Array(audio),
          mediaType,
          modelId: options.name,
          appliedSpeed: request.speed ?? null,
          elapsedSeconds: (Date.now() - started) / 1000,
          // Zero: a local model has no per-character price. The character count
          // is still recorded so a local run and a hosted run stay comparable.
          usage: { inputTokens: 0, outputTokens: 0, speechCharacters: request.text.length },
        };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

/** How much of each output stream to keep for a failure message. */
const TAIL_BYTES = 2000;

/**
 * Keeps only the last `TAIL_BYTES` of a stream.
 *
 * Two jobs, and the second is the one that matters. Bounding memory is
 * housekeeping — a chatty runner over a 40-minute episode should not
 * accumulate its whole log. Consuming the stream at all is the requirement:
 * an unread pipe holds ~64 KiB and then blocks the writer indefinitely.
 */
function tail() {
  let text = "";
  return {
    consume(stream: NodeJS.ReadableStream) {
      stream.on("data", (chunk: Buffer) => {
        text = (text + chunk.toString()).slice(-TAIL_BYTES);
      });
    },
    get text() {
      return text;
    },
  };
}

function run(command: string, args: string[], timeoutSeconds: number, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      // Never a shell: episode text is model output and must not reach one.
      shell: false,
      // stdin is /dev/null so a runner that reads it gets EOF and exits, rather
      // than waiting on a pipe nothing will ever write to.
      stdio: ["ignore", "pipe", "pipe"],
      ...(cwd === undefined ? {} : { cwd }),
    });

    // Both streams are drained, not just stderr. Leaving stdout unread hung
    // this on any runner that prints more than a pipe buffer -- mlx-audio does
    // it with one progress bar -- and the symptom was a timeout, which points
    // at the model being slow rather than at this function. Reading it also
    // means a runner that explains its failure on stdout is quoted rather than
    // reduced to an exit code.
    const out = tail();
    const err = tail();
    out.consume(child.stdout);
    err.consume(child.stderr);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} exceeded ${timeoutSeconds}s and was killed`));
    }, timeoutSeconds * 1000);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`could not start ${command}: ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const said = [err.text, out.text].filter(Boolean).join("\n").trim();
      reject(new Error(`${command} exited ${code}${said ? `\n${said}` : ""}`));
    });
  });
}

/**
 * Real-time factor: seconds of compute per second of audio produced.
 *
 * Below 1.0 means faster than real time. It is the honest way to describe **one
 * call**, and a trap for describing a workload: a local runner pays a fixed
 * model-load cost per invocation, so the factor falls as the call gets longer.
 * The same model measured on this machine reported 0.142 on a 45-second call
 * and 0.087 on a 263-second one. Neither is "the" RTF, and multiplying either
 * by an episode length answers a question nobody asked.
 *
 * Use `fitSynthesisCost` and `projectRenderSeconds` to project. This stays for
 * describing a single measurement.
 */
export function realTimeFactor(elapsedSeconds: number, audioSeconds: number): number {
  if (audioSeconds <= 0) return Infinity;
  return elapsedSeconds / audioSeconds;
}

/**
 * Estimates spoken duration from character count.
 *
 * ~14 characters per second is ordinary English narration (roughly 150 words
 * per minute). It is a planning figure and nothing more: Kokoro's `af_heart`
 * measured 16.2 chars/sec here, so this runs ~15% long, and an RTF computed
 * against it comes out ~15% better than the truth. `wavDurationSeconds` reads
 * the real number off the audio; this is the fallback for formats it cannot
 * parse.
 */
export function estimateSpokenSeconds(characters: number, charsPerSecond = 14): number {
  return characters / charsPerSecond;
}

/**
 * Reads the duration out of a WAV, or null when the bytes are not a WAV.
 *
 * Null rather than a fallback estimate on purpose. A caller that silently
 * substitutes an estimate reports a measured-looking number that was guessed;
 * returning null forces the choice to be visible at the call site.
 */
export function wavDurationSeconds(audio: Uint8Array): number | null {
  if (audio.byteLength < 44) return null;

  const chunks = readWavChunks(audio);
  if (chunks === null) return null;

  let byteRate = 0;
  for (const chunk of chunks) {
    if (chunk.id === "fmt " && chunk.body.length >= 16) {
      byteRate = chunk.body.readUInt32LE(8);
    } else if (chunk.id === "data") {
      if (byteRate <= 0) return null;
      return chunk.body.length / byteRate;
    }
  }

  return null;
}

/** What a local runner costs: a fixed price per call, plus a price per second of audio. */
export interface SynthesisCost {
  /** Seconds burned before any audio is produced — interpreter start, model load. */
  fixedSeconds: number;
  /** Seconds of compute per second of audio, once the model is loaded. */
  marginalRtf: number;
}

export interface CostSample {
  audioSeconds: number;
  elapsedSeconds: number;
}

/**
 * Fits `elapsed = fixed + marginal x audioSeconds` by least squares.
 *
 * Two terms, because a local runner has two. Measuring at one call size cannot
 * separate them, and the whole class of wrong projection — scaling a per-call
 * RTF to an episode — comes from assuming the fixed term is zero.
 */
export function fitSynthesisCost(samples: readonly CostSample[]): SynthesisCost {
  if (samples.length < 2) {
    throw new Error("fitSynthesisCost needs at least two measurements to separate the terms");
  }

  const n = samples.length;
  const sumX = samples.reduce((total, s) => total + s.audioSeconds, 0);
  const sumY = samples.reduce((total, s) => total + s.elapsedSeconds, 0);
  const sumXX = samples.reduce((total, s) => total + s.audioSeconds ** 2, 0);
  const sumXY = samples.reduce((total, s) => total + s.audioSeconds * s.elapsedSeconds, 0);

  const denominator = n * sumXX - sumX ** 2;
  if (denominator === 0) {
    throw new Error("fitSynthesisCost needs samples at different lengths, not repeats of one");
  }

  const marginalRtf = (n * sumXY - sumX * sumY) / denominator;
  return { fixedSeconds: (sumY - marginalRtf * sumX) / n, marginalRtf };
}

/**
 * Projects the compute to render an episode, given how it will be cut up.
 *
 * `segments` is the parameter that matters and the one a single RTF hides.
 * `createLocalTts` spawns a process per `synthesise` call, so the fixed cost is
 * paid per segment, not per episode. On this machine a 40-minute episode is
 * ~3 minutes as one call and ~9 minutes as 120 — same audio, same model, three
 * times the compute. That is an episode-planner decision, not a tuning detail.
 */
export function projectRenderSeconds(
  cost: SynthesisCost,
  audioSeconds: number,
  segments = 1,
): number {
  return segments * cost.fixedSeconds + cost.marginalRtf * audioSeconds;
}
