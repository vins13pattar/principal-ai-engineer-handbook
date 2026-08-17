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
        voice: identifier,
        language: languageTag,
        measuredOn: identifier,
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
    "voice": "af_heart",
    "language": "en-US",
    "measuredOn": "Apple M4, 24 GB",
    "charsPerSecond": 16.2,
    "synthesisCost": { "fixedSeconds": 3.16, "marginalRtf": 0.073 },
    "runner": {
      "name": "kokoro-82m",
      "cwd": "packages/podcast-providers",
      "command": ".venv/bin/python",
      "args": ["-u", "runners/kokoro_mlx.py", "--text", "{text}", "--out", "{out}"],
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
