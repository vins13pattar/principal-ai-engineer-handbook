import type { DiagramStep, LegendItem } from "../diagram/types.ts";

/** A reveal in a scene: the fraction of the scene it starts at, and the spoken phrase that cues it. */
export interface Beat {
  at: number;
  /** A phrase from the narration. Once word timings exist it replaces the estimated `at`. */
  cue?: string;
}

export interface Hazard {
  title: string;
  body: string;
}

export interface Point {
  statement: string;
  support: string;
}

interface Base {
  id: string;
  headline: string;
  /** The words spoken over this scene. The estimate of its length comes from this. */
  narration: string;
  /** Measured narration length once audio exists; overrides the word-count estimate. */
  audioSeconds?: number;
  /** Public path of this scene's narration audio, once recorded. */
  audio?: string;
}

export type Scene =
  /** A scene drawn by a module-specific component in `src/scenes/mcp/`. */
  | (Base & {
      kind: "custom";
      component: "mcp-hook" | "mcp-bridges" | "mcp-spectrum" | "mcp-routes";
      beats: Beat[];
    })
  | (Base & {
      kind: "diagram";
      layout: "hostClientServer" | "statelessRouting";
      steps: DiagramStep[];
      /** Edge ids drawn as a route that cannot be taken. */
      blocked?: string[];
      legend?: LegendItem[];
    })
  | (Base & {
      kind: "anatomy";
      lines: { text: string; group: "route" | "meta" | "plain" }[];
      notes: { group: "route" | "meta"; title: string; body: string }[];
      /** One beat per note, in order. */
      beats: Beat[];
    })
  | (Base & { kind: "hazards"; hazards: Hazard[]; beats: Beat[] })
  | (Base & { kind: "recap"; points: Point[]; footer: string; beats: Beat[] });

/** What the YouTube page for a video needs beyond its scenes. */
export interface YouTubeMeta {
  /** The text that follows "Module NN:" in the video title. */
  titleSuffix: string;
  /** One or two sentences that open the description, before the chapters. */
  summary: string;
  links: { label: string; url: string }[];
  tags: string[];
}

export interface VideoScript {
  slug: string;
  /** The module number, e.g. "06". */
  module: string;
  /** The plate number printed on every frame, e.g. "PLATE 06 · MCP". */
  plate: string;
  chapter: string;
  title: string;
  youtube: YouTubeMeta;
  scenes: Scene[];
}

/** Narration pace used until real audio is measured. Replaced per scene by `audioSeconds`. */
export const WORDS_PER_SECOND = 2.55;
export const SCENE_PAD_SECONDS = 0.9;

export function sceneSeconds(scene: Scene): number {
  if (scene.audioSeconds) return scene.audioSeconds + SCENE_PAD_SECONDS;
  const words = scene.narration.trim().split(/\s+/).length;
  return words / WORDS_PER_SECOND + SCENE_PAD_SECONDS;
}
