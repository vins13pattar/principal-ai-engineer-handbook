import React from "react";
import { Composition } from "remotion";
import { Video, totalFrames } from "./Video.tsx";
import { withAudio, type AudioManifest } from "./videos/audio.ts";
import mcpAudio from "./videos/06-mcp.audio.json";
import { mcp } from "./videos/mcp.ts";
import { size } from "./theme.ts";

const narrated = withAudio(mcp, mcpAudio as AudioManifest);

/**
 * Two compositions per video: the silent cut that renders anywhere from the script alone, and the
 * narrated cut that needs `public/narration/<slug>/` from running `narrate` on the Mac.
 */
export const Root: React.FC = () => (
  <>
    <Composition
      id="Mcp"
      component={Video}
      defaultProps={{ script: mcp }}
      durationInFrames={totalFrames(mcp, size.fps)}
      fps={size.fps}
      width={size.width}
      height={size.height}
    />
    <Composition
      id="McpNarrated"
      component={Video}
      defaultProps={{ script: narrated }}
      durationInFrames={totalFrames(narrated, size.fps)}
      fps={size.fps}
      width={size.width}
      height={size.height}
    />
  </>
);
