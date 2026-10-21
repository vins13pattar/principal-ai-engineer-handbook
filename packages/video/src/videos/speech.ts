import type { Scene } from "./types.ts";

/**
 * Words a text-to-speech model reads wrongly, and what to say instead. Applied to the spoken text
 * only; captions and the transcript keep the written form. Longer keys are listed first so
 * `Mcp-Method` is not caught by `MCP`.
 */
const LEXICON: [RegExp, string | ((match: string, word: string) => string)][] = [
  [/\bMcp-Method\b/g, "M C P method"],
  [/\bMcp-Name\b/g, "M C P name"],
  [/\bJSON-RPC\b/g, "JSON R P C"],
  [/\bHTTP\+SSE\b/g, "H T T P plus S S E"],
  [/\bstdio\b/g, "standard I O"],
  [/_meta\b/g, "underscore meta"],
  [/\bgRPC\b/g, "g R P C"],
  [/\bOAuth\b/g, "oh auth"],
  [/\bOIDC\b/g, "O I D C"],
  [/\bK8s\b/g, "Kubernetes"],
  [/\bp99\b/g, "P ninety-nine"],
  [/\bp95\b/g, "P ninety-five"],
  [/\bp50\b/g, "P fifty"],
  [/\bTTFT\b/g, "T T F T"],
  [
    /\b(GPU|CPU|LLM|API|KV|SLO|SLA|IAM|VPC|JWT|TLS|DNS|CDN|ADR|RFC|SQL|TTL|SDK|CI|CD|QPS|RPS|HPA|SSO|RBAC|PII|URL|UI|AI|ML|HTTPS|TCP|UDP|IP|VM|AWS|GCP|OOM)\b/g,
    (_: string, word: string) => word.split("").join(" "),
  ],
  [/\bMCP\b/g, "M C P"],
  [/\bHTTP\b/g, "H T T P"],
  [/\bSSE\b/g, "S S E"],
  [/\b2026-07-28\b/g, "the July twenty-eighth, twenty twenty-six"],
  [/\b2025-11-25\b/g, "November twenty-fifth, twenty twenty-five"],
];

export function spokenText(scene: Scene): string {
  return LEXICON.reduce(
    (text, [pattern, say]) => text.replace(pattern, say as never),
    scene.narration,
  );
}

/**
 * cyrb53: a small, fast, deterministic string hash. Not cryptographic, and it does not need to be:
 * it only detects that a scene's text changed. Pure JavaScript so the Remotion bundle, which
 * cannot import `node:crypto`, and the narration script compute the same value.
 */
function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Identifies what a scene says. Voice, speed, and model are tracked once per video, in the manifest. */
export function textHash(scene: Scene): string {
  return hash53(spokenText(scene));
}
