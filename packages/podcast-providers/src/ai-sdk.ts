/**
 * The Vercel AI SDK behind the ports.
 *
 * This is the only file that imports `ai` or a provider package. Every choice
 * here is reversible by rewriting this one module, which is the property
 * ADR-0008 was buying.
 *
 * Why the AI SDK rather than LangChain JS, for this pipeline specifically:
 * **it covers speech and text through the same provider shape.** `@ai-sdk/openai`
 * and `@ai-sdk/elevenlabs` both expose `.speech()`, so changing voice vendor is
 * a configuration change. `@langchain/core` has no speech abstraction at all —
 * its model interfaces are language models and embeddings — so a LangChain
 * pipeline would need a second, hand-written abstraction for the voice half
 * anyway. Given that, the hand-written abstraction is these ports, and the
 * thing underneath may as well cover both.
 */

import { generateObject, generateSpeech } from "ai";
import type { LanguageModel, SpeechModel } from "ai";
import type {
  LlmPort,
  LlmResult,
  SpeechRequest,
  StructuredRequest,
  TtsPort,
  TtsResult,
} from "./ports.ts";

/**
 * Wraps a configured AI SDK language model as an `LlmPort`.
 *
 * The model arrives already built, so this module never decides which provider
 * or which base URL — that is `registry.ts`, and keeping it out of here is what
 * lets the gateway be a deployment concern rather than a code path.
 */
export function llmFromModel(name: string, model: LanguageModel): LlmPort {
  return {
    name,
    async generate<T>(request: StructuredRequest<T>): Promise<LlmResult<T>> {
      const result = await generateObject({
        model,
        schema: request.schema,
        system: request.system,
        prompt: request.prompt,
        ...(request.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: request.maxOutputTokens }),
      });

      return {
        value: result.object as T,
        modelId: typeof model === "string" ? model : model.modelId,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
          speechCharacters: 0,
        },
      };
    },
  };
}

/**
 * Wraps a configured AI SDK speech model as a `TtsPort`.
 *
 * `appliedSpeed` is reported as null whenever no speed was requested, and
 * otherwise as the value passed through. The AI SDK does not tell us whether a
 * provider honoured it, so this reports intent rather than confirmation — the
 * comment on `TtsResult.appliedSpeed` says why the distinction is worth
 * carrying at all, and a provider adapter that can confirm should override it.
 */
export function ttsFromModel(name: string, model: SpeechModel): TtsPort {
  return {
    name,
    async synthesise(request: SpeechRequest): Promise<TtsResult> {
      const result = await generateSpeech({
        model,
        text: request.text,
        voice: request.voice,
        ...(request.speed === undefined ? {} : { speed: request.speed }),
      });

      return {
        audio: result.audio.uint8Array,
        mediaType: result.audio.mediaType,
        modelId: typeof model === "string" ? model : model.modelId,
        appliedSpeed: request.speed ?? null,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          speechCharacters: request.text.length,
        },
      };
    },
  };
}
