/**
 * The operator's configuration, validated before anything is spent.
 *
 * Strict on keys so a misspelling fails rather than silently reverting to
 * nothing, and bounded on values because `.strict()` says nothing about
 * `charsPerSecond: 0` -- which divides -- or a negative token bound, which
 * reaches a provider.
 *
 * The bounds deliberately mirror `assertPlanBudget`, including its asymmetry:
 * `fixedSeconds` is a divisor so it must be positive, while `marginalRtf` may
 * legitimately be zero. Duplicating them moves the failure from partway through
 * a run to config load, where the message can name the file and the field.
 *
 * Nothing here touches the filesystem. Whether the runner command exists is a
 * question for `create --run` preflight; asking it at load would stop `plan`
 * working on any machine without the synthesis venv.
 */

import { z } from "zod";
import {
  ALL_LANGUAGES,
  SPEECH_LANGUAGE_COVERAGE,
  TEXT_PROVIDERS,
} from "@handbook/podcast-providers";

const identifier = z.string().trim().min(1);
const positive = z.number().finite().positive();
const nonNegative = z.number().finite().nonnegative();

const languageTag = z
  .enum(ALL_LANGUAGES)
  .refine((tag) => (SPEECH_LANGUAGE_COVERAGE["local"] ?? []).includes(tag), {
    message: `local speech covers only ${(SPEECH_LANGUAGE_COVERAGE["local"] ?? []).join(", ")}`,
  });

export const PodcastConfigSchema = z
  .object({
    llm: z
      .object({
        provider: z.enum(TEXT_PROVIDERS),
        modelId: identifier,
        maxOutputTokens: z.number().int().positive(),
      })
      .strict(),
    prices: z
      .object({
        inputPerMillionTokens: nonNegative,
        outputPerMillionTokens: nonNegative,
        speechPerMillionCharacters: nonNegative,
      })
      .strict(),
    tts: z
      .object({
        // The only speech provider this configuration can construct: `runner`
        // describes a subprocess and `createLocalTts` is what consumes it.
        provider: z.literal("local"),
        modelId: identifier,
        /**
         * One voice per speaker, and both required.
         *
         * A single `voice` with a fallback for the second speaker produces an
         * episode where two people sound identical -- which reads as a bug in
         * the dialogue, not in the casting, and is invisible to every check
         * except listening.
         */
        voices: z.object({ host: identifier, guest: identifier }).strict(),
        language: languageTag,
        measuredOn: identifier,
        /**
         * Speaking rate, and the number that decides whether "5 minutes" means
         * five minutes.
         *
         * Measure it on dialogue, not on prose. The benchmark's 16.2 came from
         * one paragraph read straight through; real two-speaker dialogue has
         * more sentence breaks and more punctuation, and both runs of it here
         * came back at 14.0 over 8,860 characters. Using the prose figure made
         * a 300-second request produce 513 seconds of audio.
         */
        charsPerSecond: positive,
        synthesisCost: z.object({ fixedSeconds: positive, marginalRtf: nonNegative }).strict(),
        runner: z
          .object({
            name: identifier,
            cwd: identifier.optional(),
            command: identifier,
            args: z.array(identifier),
            mediaType: identifier.optional(),
            timeoutSeconds: positive.optional(),
          })
          .strict(),
      })
      .strict(),
    plan: z.object({ expansionFactor: positive, maxRenderSeconds: positive }).strict(),
  })
  .strict();

export type PodcastConfig = z.infer<typeof PodcastConfigSchema>;

export const CONFIG_TEMPLATE = `{
  "llm": { "provider": "anthropic", "modelId": "claude-...", "maxOutputTokens": 4000 },
  "prices": {
    "inputPerMillionTokens": 3.0,
    "outputPerMillionTokens": 15.0,
    "speechPerMillionCharacters": 0
  },
  "tts": {
    "provider": "local",
    "modelId": "mlx-community/Kokoro-82M-bf16",
    "voices": { "host": "af_heart", "guest": "am_michael" },
    "language": "en-US",
    "measuredOn": "Apple M4, 24 GB",
    "charsPerSecond": 14.0,
    "synthesisCost": { "fixedSeconds": 3.16, "marginalRtf": 0.073 },
    "runner": {
      "name": "kokoro-82m",
      "cwd": "packages/podcast-providers",
      "command": ".venv/bin/python",
      "args": [
        "-u", "runners/kokoro_mlx.py",
        "--text", "{text}", "--out", "{out}",
        "--voice", "{voice}", "--lang", "{language}"
      ],
      "mediaType": "audio/wav",
      "timeoutSeconds": 600
    }
  },
  "plan": { "expansionFactor": 3, "maxRenderSeconds": 300 }
}`;

export function parseConfig(raw: unknown): PodcastConfig {
  const parsed = PodcastConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  throw new Error(
    `podcast.config.json is not valid:\n${parsed.error.message}\n\nExpected shape:\n${CONFIG_TEMPLATE}`,
  );
}
