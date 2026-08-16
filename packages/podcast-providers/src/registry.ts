/**
 * Choosing a provider, and pointing it at a gateway when one is configured.
 *
 * Every provider here is constructed the same way: pick the SDK provider
 * factory, and give it a `baseURL` that is either the vendor's default or the
 * Cloudflare AI Gateway path for that vendor. **That single substitution is the
 * whole gateway integration.** No application code changes, no request shapes
 * change, and turning the gateway off is deleting two environment variables.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createElevenLabs } from "@ai-sdk/elevenlabs";
import { createOpenAI } from "@ai-sdk/openai";
import { llmFromModel, ttsFromModel } from "./ai-sdk.ts";
import { type GatewayConfig, gatewayBaseUrl } from "./gateway.ts";
import type { LlmPort, TtsPort } from "./ports.ts";

/** Text providers this package knows how to build. */
export const TEXT_PROVIDERS = ["openai", "anthropic"] as const;
export type TextProvider = (typeof TEXT_PROVIDERS)[number];

/** Speech providers this package knows how to build. */
export const SPEECH_PROVIDERS = ["openai", "elevenlabs"] as const;
export type SpeechProvider = (typeof SPEECH_PROVIDERS)[number];

export interface ProviderOptions {
  apiKey: string;
  modelId: string;
  /** When present, requests route through Cloudflare AI Gateway. */
  gateway?: GatewayConfig;
}

/** Cloudflare's provider id for a vendor, which is not always the vendor's own name. */
const GATEWAY_IDS: Record<TextProvider | SpeechProvider, string> = {
  openai: "openai",
  anthropic: "anthropic",
  elevenlabs: "elevenlabs",
};

function baseUrlFor(
  provider: TextProvider | SpeechProvider,
  gateway: GatewayConfig | undefined,
): string | undefined {
  if (!gateway) return undefined;
  return gatewayBaseUrl(gateway, GATEWAY_IDS[provider]);
}

export function createLlm(provider: TextProvider, options: ProviderOptions): LlmPort {
  const baseURL = baseUrlFor(provider, options.gateway);
  const settings = { apiKey: options.apiKey, ...(baseURL === undefined ? {} : { baseURL }) };
  const name = `${provider}:${options.modelId}${options.gateway ? " (via AI Gateway)" : ""}`;

  if (provider === "anthropic") {
    return llmFromModel(name, createAnthropic(settings)(options.modelId));
  }
  return llmFromModel(name, createOpenAI(settings)(options.modelId));
}

export function createTts(provider: SpeechProvider, options: ProviderOptions): TtsPort {
  const baseURL = baseUrlFor(provider, options.gateway);
  const settings = { apiKey: options.apiKey, ...(baseURL === undefined ? {} : { baseURL }) };
  const name = `${provider}:${options.modelId}${options.gateway ? " (via AI Gateway)" : ""}`;

  if (provider === "elevenlabs") {
    return ttsFromModel(name, createElevenLabs(settings).speech(options.modelId));
  }
  return ttsFromModel(name, createOpenAI(settings).speech(options.modelId));
}

/**
 * A port that tries each candidate in order.
 *
 * Worth being clear about when this is the wrong tool: **if you run behind AI
 * Gateway, configure fallback there instead.** The gateway retries and fails
 * over without the application knowing, which is strictly better — it covers
 * calls this wrapper never sees and it does not need a deploy to change.
 *
 * This exists for running without a gateway, and for the case a gateway cannot
 * cover: failing over between two vendors whose *credentials* differ, where the
 * decision is the application's.
 */
export function withFallback(primary: LlmPort, ...fallbacks: LlmPort[]): LlmPort {
  const chain = [primary, ...fallbacks];
  return {
    name: `fallback(${chain.map((port) => port.name).join(" -> ")})`,
    async generate(request) {
      const failures: string[] = [];
      for (const port of chain) {
        try {
          return await port.generate(request);
        } catch (error) {
          failures.push(`${port.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      // Every failure, not just the last: the last one is rarely the
      // interesting one when a chain exhausts.
      throw new Error(`all ${chain.length} providers failed\n  ${failures.join("\n  ")}`);
    },
  };
}
