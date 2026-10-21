import React from "react";
import {
  Audio,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { LAYOUTS } from "./generated/layouts.ts";
import { Anatomy } from "./scenes/Anatomy.tsx";
import { Axis } from "./scenes/Axis.tsx";
import { Bars } from "./scenes/Bars.tsx";
import { Chart } from "./scenes/Chart.tsx";
import { DiagramBuild } from "./scenes/DiagramBuild.tsx";
import { Hazards } from "./scenes/Hazards.tsx";
import { Lanes } from "./scenes/Lanes.tsx";
import { Bridges } from "./scenes/mcp/Bridges.tsx";
import { Hook } from "./scenes/mcp/Hook.tsx";
import { Routes } from "./scenes/mcp/Routes.tsx";
import { Spectrum } from "./scenes/mcp/Spectrum.tsx";
import { Recap } from "./scenes/Recap.tsx";
import { Sequence as SequenceScene } from "./scenes/Sequence.tsx";
import { Story } from "./scenes/Story.tsx";
import { sceneSeconds, type Scene, type VideoScript } from "./videos/types.ts";

const FADE = 9;

export function sceneFrames(script: VideoScript, fps: number): number[] {
  return script.scenes.map((scene) => Math.max(1, Math.round(sceneSeconds(scene) * fps)));
}

export function totalFrames(script: VideoScript, fps: number): number {
  return sceneFrames(script, fps).reduce((sum, n) => sum + n, 0);
}

const Body: React.FC<{ scene: Scene }> = ({ scene }) => {
  switch (scene.kind) {
    case "custom":
      switch (scene.component) {
        case "mcp-hook":
          return <Hook beats={scene.beats} />;
        case "mcp-bridges":
          return <Bridges beats={scene.beats} />;
        case "mcp-spectrum":
          return <Spectrum beats={scene.beats} />;
        case "mcp-routes":
          return <Routes beats={scene.beats} />;
      }
      return null;
    case "diagram": {
      const layout = LAYOUTS[scene.layout];
      if (!layout) throw new Error(`Unknown diagram layout ${scene.layout}`);
      return (
        <DiagramBuild
          layout={layout}
          steps={scene.steps}
          {...(scene.blocked ? { blocked: scene.blocked } : {})}
          {...(scene.legend ? { legend: scene.legend } : {})}
        />
      );
    }
    case "sequence":
      return <SequenceScene layout={scene.layout} steps={scene.steps} />;
    case "story":
      return (
        <Story
          map={scene.map}
          runs={scene.runs}
          captions={scene.captions}
          beats={scene.beats}
          {...(scene.marks ? { marks: scene.marks } : {})}
          {...(scene.note ? { note: scene.note } : {})}
        />
      );
    case "hazards":
      return <Hazards map={scene.map} hazards={scene.hazards} beats={scene.beats} />;
    case "axis":
      return (
        <Axis
          ends={scene.ends}
          stations={scene.stations}
          beats={scene.beats}
          {...(scene.chip ? { chip: scene.chip } : {})}
        />
      );
    case "lanes":
      return (
        <Lanes
          lanes={scene.lanes}
          beats={scene.beats}
          {...(scene.takeaway ? { takeaway: scene.takeaway } : {})}
        />
      );
    case "bars":
      return (
        <Bars
          items={scene.items}
          beats={scene.beats}
          {...(scene.caption ? { caption: scene.caption } : {})}
          {...(scene.max ? { max: scene.max } : {})}
        />
      );
    case "anatomy":
      return (
        <Anatomy
          lines={scene.lines}
          notes={scene.notes}
          beats={scene.beats}
          {...(scene.prose ? { prose: true } : {})}
        />
      );
    case "recap":
      return <Recap points={scene.points} footer={scene.footer} beats={scene.beats} />;
  }
};

const SceneShell: React.FC<{
  script: VideoScript;
  scene: Scene;
  index: number;
  start: number;
  total: number;
  starts: number[];
}> = ({ script, scene, index, start, total, starts }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = Math.min(
    interpolate(frame, [0, FADE], [index === 0 ? 1 : 0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
    }),
  );
  return (
    <div style={{ position: "absolute", inset: 0, opacity: fade }}>
      <Chart
        plate={script.plate}
        headline={scene.headline}
        seed={index + 3 + Number(script.module) * 11}
        route={{ starts, active: index, progress: (start + frame) / total }}
      >
        <Body scene={scene} />
      </Chart>
      {scene.audio && <Audio src={staticFile(scene.audio)} />}
    </div>
  );
};

export const Video: React.FC<{ script: VideoScript }> = ({ script }) => {
  const { fps } = useVideoConfig();
  const frames = sceneFrames(script, fps);
  const total = frames.reduce((a, b) => a + b, 0);
  const begins = frames.map((_, i) => frames.slice(0, i).reduce((a, b) => a + b, 0));
  const starts = begins.map((b) => b / total);
  return (
    <>
      {script.scenes.map((scene, i) => (
        <Sequence key={scene.id} from={begins[i]!} durationInFrames={frames[i]!} name={scene.id}>
          <SceneShell
            script={script}
            scene={scene}
            index={i}
            start={begins[i]!}
            total={total}
            starts={starts}
          />
        </Sequence>
      ))}
    </>
  );
};
