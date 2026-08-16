/**
 * The only error shape allowed to cross out of the provider layer.
 *
 * `ai-sdk.ts` is the one file permitted to import `ai`, so it is the one place
 * that can recognise the SDK's own errors. Everything downstream -- the engine,
 * the CLI -- is forbidden that import, which means without a translation here a
 * schema failure arrives as an opaque object nothing may legally inspect.
 *
 * The field list is a whitelist, not a summary. A run directory is an artifact
 * that gets shared, so the provider's error object, its headers, its stack and
 * anything carrying credentials are deliberately absent and must stay so.
 */

import type { Usage } from "./ports.ts";

export interface ModelResponseDetails {
  rawText?: string;
  usage?: Usage;
  finishReason?: string;
}

export class ModelResponseError extends Error {
  readonly rawText: string | undefined;
  readonly usage: Usage | undefined;
  readonly finishReason: string | undefined;

  constructor(message: string, details: ModelResponseDetails = {}) {
    super(message);
    // Written out longhand: `--experimental-strip-types` rejects parameter
    // properties outright, and Vitest would transpile past the mistake.
    this.name = "ModelResponseError";
    this.rawText = details.rawText;
    this.usage = details.usage;
    this.finishReason = details.finishReason;
  }
}
