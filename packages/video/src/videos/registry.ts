import { mcp } from "./mcp.ts";
import type { VideoScript } from "./types.ts";

/** Every video the project knows how to build, by slug. Add a module's script here. */
export const scripts: Record<string, VideoScript> = {
  [mcp.slug]: mcp,
};
