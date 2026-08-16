/**
 * Cloudflare AI Gateway.
 *
 * The most common confusion about AI Gateway is treating it as an alternative
 * to an SDK like the Vercel AI SDK or LangChain. It is not. It is a **reverse
 * proxy that sits underneath whichever SDK you chose**: you point the SDK at a
 * gateway base URL instead of the provider's, and the request still speaks the
 * provider's own wire format.
 *
 * What you get for that redirection is caching, retries and fallback, rate
 * limiting, request logging, and per-provider cost accounting — all applied
 * without the application knowing. Which means it composes with the decision in
 * ADR-0008 rather than competing with it, and it is the reason multi-provider
 * failover does not need to live in application code.
 *
 * The list below is taken from `workers-ai-provider`'s own `GATEWAY_PROVIDERS`
 * table rather than transcribed from documentation, and asserted against it in
 * the tests so it cannot silently drift.
 */

/** Base host for Cloudflare AI Gateway. */
export const GATEWAY_HOST = "https://gateway.ai.cloudflare.com/v1";

export interface GatewayConfig {
  accountId: string;
  gatewayName: string;
}

/**
 * Builds the base URL for one provider behind a gateway.
 *
 * Shape: `https://gateway.ai.cloudflare.com/v1/{accountId}/{gateway}/{provider}`.
 * Note the provider segment uses Cloudflare's own id, which is not always the
 * vendor's name — Google AI Studio is `google-ai-studio`, xAI is `grok`. Getting
 * that wrong produces a 404 at call time rather than a configuration error, so
 * `gatewayBaseUrl` refuses an unknown provider up front.
 */
export function gatewayBaseUrl(config: GatewayConfig, providerId: string): string {
  if (!config.accountId.trim() || !config.gatewayName.trim()) {
    throw new Error("AI Gateway needs both an accountId and a gatewayName");
  }
  if (!isGatewayProvider(providerId)) {
    throw new Error(
      `"${providerId}" is not a Cloudflare AI Gateway provider id. ` +
        `Note the ids are Cloudflare's, not the vendor's: Google AI Studio is ` +
        `"google-ai-studio" and xAI is "grok". Known: ${GATEWAY_PROVIDER_IDS.join(", ")}`,
    );
  }
  return `${GATEWAY_HOST}/${config.accountId}/${config.gatewayName}/${providerId}`;
}

/**
 * Provider ids Cloudflare AI Gateway can proxy.
 *
 * Three of these are voice rather than text — `elevenlabs`, `deepgram`, and
 * `cartesia` — which is what makes the gateway useful for a podcast pipeline
 * and not just for the LLM half. Text-to-speech is the expensive, most-repeated
 * call in episode generation, so caching and cost logging matter more there
 * than anywhere else.
 */
export const GATEWAY_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google-ai-studio",
  "grok",
  "groq",
  "alibaba",
  "minimax",
  "google-vertex-ai",
  "deepseek",
  "mistral",
  "perplexity-ai",
  "cerebras",
  "openrouter",
  "fireworks",
  "cohere",
  "baseten",
  "parallel",
  "azure-openai",
  "aws-bedrock",
  "huggingface",
  "replicate",
  "fal",
  "ideogram",
  "cartesia",
  "deepgram",
  "elevenlabs",
] as const;

export type GatewayProviderId = (typeof GATEWAY_PROVIDER_IDS)[number];

/** Gateway providers that can synthesise speech. */
export const GATEWAY_SPEECH_PROVIDER_IDS = [
  "openai",
  "elevenlabs",
  "cartesia",
  "deepgram",
] as const;

export function isGatewayProvider(id: string): id is GatewayProviderId {
  return (GATEWAY_PROVIDER_IDS as readonly string[]).includes(id);
}

/**
 * Reads gateway config from the environment, or returns null when unset.
 *
 * Null is a supported mode, not a failure: calling providers directly is the
 * right default for a contributor with one API key and no Cloudflare account.
 * The gateway is an operational upgrade, so it must not be a prerequisite for
 * running anything.
 */
export function gatewayFromEnv(env: Record<string, string | undefined>): GatewayConfig | null {
  const accountId = env["CLOUDFLARE_ACCOUNT_ID"];
  const gatewayName = env["CLOUDFLARE_AI_GATEWAY"];
  if (!accountId || !gatewayName) return null;
  return { accountId, gatewayName };
}
