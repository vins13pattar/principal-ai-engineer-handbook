import { mindset } from "./00-principal-engineer-mindset.ts";
import { mcp } from "./06-mcp.ts";
import type { VideoScript } from "./types.ts";

/**
 * Every video the project knows how to build, by slug. To add a module: write
 * `src/videos/<slug>.ts`, add it here, then run `pnpm sync` and `pnpm layout`.
 */
export const scripts: Record<string, VideoScript> = {
  [mindset.slug]: mindset,
  [mcp.slug]: mcp,
};
