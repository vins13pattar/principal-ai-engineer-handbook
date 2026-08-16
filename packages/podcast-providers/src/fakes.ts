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
      usage: { inputTokens: 0, outputTokens: 0, speechCharacters: request.text.length },
    };
  }
}
