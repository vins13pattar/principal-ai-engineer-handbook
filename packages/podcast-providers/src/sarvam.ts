/**
 * Sarvam AI for Indian-language speech.
 *
 * **The community Vercel AI SDK provider does not cover this.**
 * `sarvam-ai-provider` on npm exposes only `transcription` and
 * `transcriptionModel` — speech *to* text. It has no `speech`/`speechModel`, so
 * routing Sarvam TTS through `generateSpeech` is not possible today. Checked by
 * introspecting the installed package, not read off a docs page.
 *
 * So this adapter calls Sarvam's REST API directly and presents it as a
 * `TtsPort` like everything else. That is the port design earning its keep: the
 * engine cannot tell that one of its voices arrives through a different
 * mechanism than the others.
 *
 * If Sarvam ships a first-party AI SDK speech provider later, this file is
 * replaced by three lines in `registry.ts` and nothing above it changes.
 */

import type { LanguageTag } from "./language.ts";
import { isIndianLanguage } from "./language.ts";
import type { SpeechRequest, TtsPort, TtsResult } from "./ports.ts";

/** Sarvam's TTS model family. `bulbul:v3` is the current generation. */
export const SARVAM_TTS_MODELS = ["bulbul:v2", "bulbul:v3"] as const;
export type SarvamTtsModel = (typeof SARVAM_TTS_MODELS)[number];

export const SARVAM_TTS_ENDPOINT = "https://api.sarvam.ai/text-to-speech";

export interface SarvamOptions {
  apiKey: string;
  model?: SarvamTtsModel;
  /**
   * Override the endpoint.
   *
   * Neither Cloudflare AI Gateway nor Vercel AI Gateway lists Sarvam as a
   * proxied provider, so Sarvam traffic goes direct and is not covered by
   * whichever gateway handles the rest. That is a real gap in cost visibility,
   * not an oversight — the ledger in `cost.ts` is what closes it, because it
   * counts characters regardless of route.
   */
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Sarvam's API caps a single request, so long text must be chunked.
 *
 * Splitting on sentence boundaries rather than at a hard character offset,
 * because a cut mid-sentence produces an audible seam and a wrong prosody
 * contour on both sides of it.
 */
export function chunkForSarvam(text: string, limit = 1500): string[] {
  if (text.length <= limit) return [text];

  const sentences = text.match(/[^.!?।]+[.!?।]+\s*|[^.!?।]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    // A single sentence over the limit has to be broken somewhere; take the
    // hard cut rather than silently dropping it.
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += limit) {
        chunks.push(sentence.slice(i, i + limit));
      }
      continue;
    }
    if (current.length + sentence.length > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);
}

interface SarvamResponse {
  audios?: string[];
}

export function createSarvamTts(options: SarvamOptions): TtsPort {
  const model = options.model ?? "bulbul:v3";
  const endpoint = options.endpoint ?? SARVAM_TTS_ENDPOINT;
  const doFetch = options.fetchImpl ?? fetch;

  return {
    name: `sarvam:${model}`,
    async synthesise(request: SpeechRequest): Promise<TtsResult> {
      assertSarvamLanguage(request.language);

      const started = Date.now();
      const parts: Uint8Array[] = [];

      for (const chunk of chunkForSarvam(request.text)) {
        const response = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "api-subscription-key": options.apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            text: chunk,
            target_language_code: request.language,
            speaker: request.voice,
            model,
            ...(request.speed === undefined ? {} : { pace: request.speed }),
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Sarvam TTS failed: ${response.status} ${response.statusText} — ${await response.text()}`,
          );
        }

        const body = (await response.json()) as SarvamResponse;
        const encoded = body.audios?.[0];
        if (!encoded) {
          // A 200 with no audio is the dangerous case: it would otherwise
          // append zero bytes and produce a silently short episode.
          throw new Error("Sarvam TTS returned 200 with no audio payload");
        }
        parts.push(Uint8Array.from(Buffer.from(encoded, "base64")));
      }

      return {
        audio: concat(parts),
        // Sarvam returns base64 WAV, not MP3. Assembly must not assume.
        mediaType: "audio/wav",
        modelId: model,
        appliedSpeed: request.speed ?? null,
        elapsedSeconds: (Date.now() - started) / 1000,
        usage: { inputTokens: 0, outputTokens: 0, speechCharacters: request.text.length },
      };
    },
  };
}

function assertSarvamLanguage(language: LanguageTag): void {
  if (!isIndianLanguage(language)) {
    throw new Error(
      `Sarvam covers Indian languages; ${language} is not one. Route it to an ` +
        `international provider instead.`,
    );
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
