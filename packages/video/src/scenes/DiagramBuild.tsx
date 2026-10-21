import React from "react";
import { useVideoConfig } from "remotion";
import { Diagram } from "../diagram/Diagram.tsx";
import type { DiagramLayout, DiagramStep, LegendItem } from "../diagram/types.ts";

export const DiagramBuild: React.FC<{
  layout: DiagramLayout;
  steps: DiagramStep[];
  blocked?: string[];
  legend?: LegendItem[];
}> = ({ layout, steps, blocked, legend }) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <Diagram
      layout={layout}
      steps={steps}
      durationInFrames={durationInFrames}
      {...(blocked ? { blocked } : {})}
      {...(legend ? { legend } : {})}
    />
  );
};
