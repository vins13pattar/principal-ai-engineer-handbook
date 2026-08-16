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

function run(command: string, args: string[], timeoutSeconds: number, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      // Never a shell: episode text is model output and must not reach one.
      shell: false,
      ...(cwd === undefined ? {} : { cwd }),
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

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
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Real-time factor: seconds of compute per second of audio produced.
 *
 * Below 1.0 means faster than real time. This is the number that decides
 * whether local synthesis is viable, and it is the one nobody publishes for
 * your specific hardware — which is why `bench.ts` measures it rather than
 * quoting it.
 */
export function realTimeFactor(elapsedSeconds: number, audioSeconds: number): number {
  if (audioSeconds <= 0) return Infinity;
  return elapsedSeconds / audioSeconds;
}

/**
 * Estimates spoken duration from character count.
 *
 * ~14 characters per second is ordinary English narration (roughly 150 words
 * per minute). Crude, and it is only used to turn a benchmark into a
 * projection — measure the real duration from the audio file when it matters.
 */
export function estimateSpokenSeconds(characters: number, charsPerSecond = 14): number {
  return characters / charsPerSecond;
}
