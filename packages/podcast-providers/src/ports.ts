/**
 * The two interfaces the podcast engine is allowed to know about.
 *
 * The engine never imports `ai`, `@ai-sdk/*`, or any provider package. It
 * imports `LlmPort` and `TtsPort`. Everything vendor-specific lives behind
 * these two shapes, which is what makes the SDK a replaceable component rather
 * than a structural commitment — and what makes the engine testable without a
 * network or an API key.
 *
 * The ports are deliberately narrow. They expose what an episode pipeline
 * needs, not what the providers can do. A port that mirrors an SDK's full
 * surface is not an abstraction; it is a second name for the SDK.
 */

import type { z } from "zod";
import type { LanguageTag } from "./language.ts";

/** What one model call cost, in tokens and characters rather than currency. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Characters submitted for synthesis. TTS is billed per character, not per token. */
  speechCharacters: number;
}

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, speechCharacters: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    speechCharacters: a.speechCharacters + b.speechCharacters,
  };
}

export interface LlmResult<T> {
  value: T;
  usage: Usage;
  /** Which model actually answered, for the manifest and for cost attribution. */
  modelId: string;
}

export interface StructuredRequest<T> {
  /** Zod schema the response must satisfy. The same Zod that validates page frontmatter. */
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  /** Caps runaway generation. Absent means the provider default. */
  maxOutputTokens?: number;
}

/**
 * Generates structured, schema-validated output.
 *
 * There is no free-text method on purpose. Every stage of the pipeline produces
 * a typed artifact — an episode plan, dialogue turns, a review verdict — and
 * schema validation at the model boundary is what keeps a malformed response
 * from becoming a malformed episode three stages later.
 */
export interface LlmPort {
  readonly name: string;
  generate<T>(request: StructuredRequest<T>): Promise<LlmResult<T>>;
}

export interface SpeechRequest {
  text: string;
  /** Provider-specific voice identifier. */
  voice: string;
  /**
   * Required, not optional, and deliberately so.
   *
   * An optional language defaults to English somewhere in a provider adapter,
   * and a provider handed text it cannot pronounce usually returns confident
   * audio rather than an error. That produces a shippable-looking artifact in
   * the wrong language which nothing downstream can detect. Making the caller
   * state it means the mismatch is caught at the boundary.
   */
  language: LanguageTag;
  /** 1.0 is normal. Not every provider honours this; see `TtsResult.appliedSpeed`. */
  speed?: number;
}

export interface TtsResult {
  audio: Uint8Array;
  /** e.g. "audio/mpeg". Needed by the assembly step, which must not guess. */
  mediaType: string;
  usage: Usage;
  modelId: string;
  /**
   * The speed the provider actually applied, or null when it does not support
   * the control at all.
   *
   * Distinguishing "applied 1.0" from "ignored your 1.3" matters: a voice
   * director stage that thinks it is varying pace, and is not, produces a
   * flat episode with no error anywhere.
   */
  appliedSpeed: number | null;
  /**
   * Seconds of wall-clock time the synthesis took.
   *
   * Meaningless for a hosted provider beyond latency, but the whole decision
   * for a local model: real-time factor is what says whether a 40-minute
   * episode renders in four minutes or forty.
   */
  elapsedSeconds: number;
}

export interface TtsPort {
  readonly name: string;
  synthesise(request: SpeechRequest): Promise<TtsResult>;
}
