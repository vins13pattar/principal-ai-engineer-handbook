import { describe, expect, it } from "vitest";
import { GATEWAY_PROVIDERS } from "workers-ai-provider";
import {
  GATEWAY_PROVIDER_IDS,
  GATEWAY_SPEECH_PROVIDER_IDS,
  gatewayBaseUrl,
  gatewayFromEnv,
  isGatewayProvider,
} from "./gateway.ts";

describe("gatewayBaseUrl", () => {
  const config = { accountId: "acct123", gatewayName: "handbook" };

  it("builds the documented path shape", () => {
    expect(gatewayBaseUrl(config, "openai")).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct123/handbook/openai",
    );
  });

  it("uses Cloudflare's provider id, not the vendor's name", () => {
    // The trap: "google" and "xai" are what you would type, and both 404 at
    // call time rather than failing as configuration.
    expect(gatewayBaseUrl(config, "google-ai-studio")).toContain("/google-ai-studio");
    expect(() => gatewayBaseUrl(config, "google")).toThrow(/not a Cloudflare AI Gateway provider/);
    expect(() => gatewayBaseUrl(config, "xai")).toThrow(/grok/);
  });

  it("refuses incomplete configuration rather than building a broken URL", () => {
    expect(() => gatewayBaseUrl({ accountId: "", gatewayName: "g" }, "openai")).toThrow(
      /accountId and a gatewayName/,
    );
    expect(() => gatewayBaseUrl({ accountId: "a", gatewayName: "  " }, "openai")).toThrow();
  });
});

describe("the provider list", () => {
  // This is the assertion that keeps the list honest. It is transcribed into
  // this package for typing and error messages, and transcription rots -- so
  // it is checked against workers-ai-provider's own table on every run.
  it("matches workers-ai-provider's own gateway table", () => {
    const upstream = GATEWAY_PROVIDERS.map((provider) => provider.gatewayProviderId).sort();

    expect([...GATEWAY_PROVIDER_IDS].sort()).toEqual(upstream);
  });

  it("includes the three voice providers a podcast pipeline needs", () => {
    // The reason the gateway is worth using here at all: TTS is the expensive,
    // most-repeated call, so caching and cost logging matter most on this half.
    expect(GATEWAY_PROVIDER_IDS).toContain("elevenlabs");
    expect(GATEWAY_PROVIDER_IDS).toContain("deepgram");
    expect(GATEWAY_PROVIDER_IDS).toContain("cartesia");
  });

  it("lists only real gateway providers as speech providers", () => {
    for (const id of GATEWAY_SPEECH_PROVIDER_IDS) {
      expect(isGatewayProvider(id)).toBe(true);
    }
  });
});

describe("gatewayFromEnv", () => {
  it("returns null when unset, because running without a gateway is supported", () => {
    expect(gatewayFromEnv({})).toBeNull();
    expect(gatewayFromEnv({ CLOUDFLARE_ACCOUNT_ID: "a" })).toBeNull();
    expect(gatewayFromEnv({ CLOUDFLARE_AI_GATEWAY: "g" })).toBeNull();
  });

  it("reads both variables when present", () => {
    expect(gatewayFromEnv({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_GATEWAY: "g" })).toEqual({
      accountId: "a",
      gatewayName: "g",
    });
  });
});
