import React from "react";
import { useVideoConfig } from "remotion";
import { Diagram } from "../diagram/Diagram.tsx";
import type { DiagramLayout, DiagramStep } from "../diagram/types.ts";

export const DiagramBuild: React.FC<{ layout: DiagramLayout; steps: DiagramStep[] }> = ({
  layout,
  steps,
}) => {
  const { durationInFrames } = useVideoConfig();
  return <Diagram layout={layout} steps={steps} durationInFrames={durationInFrames} />;
};
