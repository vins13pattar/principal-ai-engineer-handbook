import React from "react";
import {
  Audio,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import hostClientServer from "./generated/06-mcp.host-client-server.layout.json";
import statelessRouting from "./generated/06-mcp.stateless-routing.layout.json";
import type { DiagramLayout } from "./diagram/types.ts";
import { Anatomy } from "./scenes/Anatomy.tsx";
import { Cards } from "./scenes/Cards.tsx";
import { Compare } from "./scenes/Compare.tsx";
import { DiagramBuild } from "./scenes/DiagramBuild.tsx";
import { Fanout } from "./scenes/Fanout.tsx";
import { Frame } from "./scenes/Frame.tsx";
import { sceneSeconds, type Scene, type VideoScript } from "./videos/types.ts";

const LAYOUTS: Record<string, DiagramLayout> = {
  hostClientServer: hostClientServer as DiagramLayout,
  statelessRouting: statelessRouting as DiagramLayout,
};

const FADE = 9;

export function sceneFrames(script: VideoScript, fps: number): number[] {
  return script.scenes.map((scene) => Math.max(1, Math.round(sceneSeconds(scene) * fps)));
}

export function totalFrames(script: VideoScript, fps: number): number {
  return sceneFrames(script, fps).reduce((sum, n) => sum + n, 0);
}

const Body: React.FC<{ scene: Scene }> = ({ scene }) => {
  switch (scene.kind) {
    case "fanout":
      return <Fanout />;
    case "diagram": {
      const layout = LAYOUTS[scene.layout];
      if (!layout) throw new Error(`Unknown diagram layout ${scene.layout}`);
      return <DiagramBuild layout={layout} steps={scene.steps} />;
    }
    case "cards":
      return (
        <Cards
          cards={scene.cards}
          columns={scene.columns}
          at={scene.at}
          {...(scene.footer ? { footer: scene.footer } : {})}
        />
      );
    case "anatomy":
      return <Anatomy lines={scene.lines} notes={scene.notes} />;
    case "compare":
      return <Compare left={scene.left} right={scene.right} footer={scene.footer} at={scene.at} />;
  }
};

const SceneShell: React.FC<{ script: VideoScript; scene: Scene; start: number; total: number }> = ({
  script,
  scene,
  start,
  total,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = Math.min(
    interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
    }),
  );
  return (
    <div style={{ position: "absolute", inset: 0, opacity: fade }}>
      <Frame
        tag={script.tag}
        chapter={script.chapter}
        headline={scene.headline}
        progress={(start + frame) / total}
      >
        <Body scene={scene} />
      </Frame>
      {scene.audio && <Audio src={staticFile(scene.audio)} />}
    </div>
  );
};

export const Video: React.FC<{ script: VideoScript }> = ({ script }) => {
  const { fps } = useVideoConfig();
  const frames = sceneFrames(script, fps);
  const total = frames.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return (
    <>
      {script.scenes.map((scene, i) => {
        const from = cursor;
        cursor += frames[i]!;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={frames[i]!} name={scene.id}>
            <SceneShell script={script} scene={scene} start={from} total={total} />
          </Sequence>
        );
      })}
    </>
  );
};
