import React from "react";
import { Composition } from "remotion";
import { Video, totalFrames } from "./Video.tsx";
import { mcp } from "./videos/mcp.ts";
import { size } from "./theme.ts";

export const Root: React.FC = () => (
  <Composition
    id="Mcp"
    component={Video}
    defaultProps={{ script: mcp }}
    durationInFrames={totalFrames(mcp, size.fps)}
    fps={size.fps}
    width={size.width}
    height={size.height}
  />
);
