/**
 * In-memory ports, so the engine's tests never touch a network.
 *
 * These are exported rather than confined to test files: every stage of the
 * pipeline needs them, and a fake that lives in one package's test directory
 * gets copied into the next package's test directory and then diverges.
 */

import type {
  LlmPort,
  LlmResult,
  SpeechRequest,
  StructuredRequest,
  TtsPort,
  TtsResult,
} from "./ports.ts";

export interface RecordedCall {
  system: string;
  prompt: string;
}

/**
 * Returns queued values in order, validating each against the caller's schema.
 *
 * The validation is the point. A fake that returns whatever the test hands it
 * will happily return a shape the real schema would reject, and the test then
 * proves the pipeline works on data that can never occur.
 */
export class FakeLlm implements LlmPort {
  readonly name = "fake-llm";
  readonly calls: RecordedCall[] = [];
  private readonly queue: unknown[];

  constructor(responses: unknown[]) {
    this.queue = [...responses];
  }

  async generate<T>(request: StructuredRequest<T>): Promise<LlmResult<T>> {
    this.calls.push({ system: request.system, prompt: request.prompt });

    if (this.queue.length === 0) {
      throw new Error(`FakeLlm ran out of responses after ${this.calls.length} call(s)`);
    }
    const next = this.queue.shift();
    const parsed = request.schema.safeParse(next);
    if (!parsed.success) {
      throw new Error(
        `FakeLlm response does not satisfy the caller's schema: ${parsed.error.message}`,
      );
    }

    return {
      value: parsed.data,
      modelId: "fake-llm",
      usage: {
        inputTokens: Math.ceil((request.system.length + request.prompt.length) / 4),
        outputTokens: Math.ceil(JSON.stringify(next).length / 4),
        speechCharacters: 0,
      },
    };
  }
}

/** Always fails. For exercising fallback chains. */
export class BrokenLlm implements LlmPort {
  readonly name: string;

  constructor(name = "broken-llm") {
    this.name = name;
  }

  generate<T>(_request: StructuredRequest<T>): Promise<LlmResult<T>> {
    return Promise.reject(new Error(`${this.name} is unavailable`));
  }
}

/**
 * Builds a real 16-bit mono WAV of the requested length, filled with a constant.
 *
 * The container has to be genuine: assembly parses the format header and
 * refuses mismatches, so a fake returning arbitrary bytes would test the
 * refusal path and never the join.
 */
export function fakeWav(seconds: number, sampleRate = 24_000): Uint8Array {
  const bytesPerSample = 2;
  const data = Buffer.alloc(Math.round(seconds * sampleRate) * bytesPerSample, 1);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * bytesPerSample, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);

  return new Uint8Array(Buffer.concat([header, data]));
}

/** Returns joinable WAV audio at a fixed speaking rate, and records every request. */
export class FakeWavTts implements TtsPort {
  readonly name = "fake-wav-tts";
  readonly requests: SpeechRequest[] = [];
  // A plain field, not a parameter property: this package runs under
  // `node --experimental-strip-types`, which rejects those outright. Vitest
  // transpiles them happily, so the test suite cannot catch it.
  private readonly charsPerSecond: number;

  constructor(charsPerSecond = 16) {
    this.charsPerSecond = charsPerSecond;
  }

  async synthesise(request: SpeechRequest): Promise<TtsResult> {
    this.requests.push(request);
    return {
      audio: fakeWav(request.text.length / this.charsPerSecond),
      mediaType: "audio/wav",
      modelId: "fake-wav-tts",
      appliedSpeed: request.speed ?? null,
      elapsedSeconds: 0.25,
      usage: { inputTokens: 0, outputTokens: 0, speechCharacters: request.text.length },
    };
  }
}

/** Produces deterministic bytes proportional to the text, and records every request. */
export class FakeTts implements TtsPort {
  readonly name = "fake-tts";
  readonly requests: SpeechRequest[] = [];
  /** Set false to model a provider that silently ignores the speed control. */
  honoursSpeed = true;

  async synthesise(request: SpeechRequest): Promise<TtsResult> {
    this.requests.push(request);
    return {
      audio: new Uint8Array(request.text.length).fill(1),
      mediaType: "audio/mpeg",
      modelId: "fake-tts",
      appliedSpeed: this.honoursSpeed ? (request.speed ?? null) : null,
      elapsedSeconds: 0,
      usage: { inputTokens: 0, outputTokens: 0, speechCharacters: request.text.length },
    };
  }
}
