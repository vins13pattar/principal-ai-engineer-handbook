/**
 * A fetch that waits as long as a local model needs.
 *
 * Node's built-in `fetch` gives up 300 seconds after the request is sent if no
 * response headers have arrived, and that limit is not reachable through the
 * request options — no `AbortSignal`, no timeout argument, nothing on `init`
 * moves it. It is a property of the dispatcher underneath.
 *
 * That default is sensible for an API and wrong for a laptop. A 9B model
 * reading a 24,500-token prompt sends no headers until it starts generating,
 * which took over fourteen minutes on an M4 — so the first local run failed
 * with `Headers Timeout Error` after three retries while the model was still
 * working perfectly. The symptom reads like a network fault and is not one.
 *
 * Hence an explicit dispatcher. `undici` is the library Node's own fetch is
 * built from; configuring it is the supported way to change this, not a
 * workaround.
 */

import { Agent, fetch as undiciFetch } from "undici";

/** Generous, because the thing being waited for is a laptop and not a network. */
const DEFAULT_TIMEOUT_SECONDS = 3600;

/**
 * A `fetch` that tolerates a very slow first byte.
 *
 * Shaped to what the AI SDK and this package's own adapters expect, so it can
 * be handed to `createOpenAI({ fetch })` or called directly.
 */
export function patientFetch(timeoutSeconds = DEFAULT_TIMEOUT_SECONDS): typeof globalThis.fetch {
  const ms = timeoutSeconds * 1000;
  const dispatcher = new Agent({
    // Time to first response header: the one that fires on a slow local model.
    headersTimeout: ms,
    // Time between body chunks. A model generating slowly is still generating.
    bodyTimeout: ms,
  });

  return ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher,
    })) as unknown as typeof globalThis.fetch;
}
