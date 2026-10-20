import type { DiagramStep } from "../diagram/types.ts";

export interface Card {
  title: string;
  /** A short second line, usually the deciding question or owner. */
  kicker?: string;
  body?: string;
  tone?: "default" | "danger" | "success";
}

export interface Row {
  label: string;
  value: string;
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
  | (Base & { kind: "fanout" })
  | (Base & {
      kind: "diagram";
      layout: "hostClientServer" | "statelessRouting";
      steps: DiagramStep[];
    })
  | (Base & { kind: "cards"; cards: Card[]; columns: number; at: number[]; footer?: string })
  | (Base & {
      kind: "anatomy";
      lines: { text: string; group: "route" | "meta" | "plain" }[];
      notes: { group: "route" | "meta"; title: string; body: string; at: number }[];
    })
  | (Base & {
      kind: "compare";
      left: { title: string; rows: Row[] };
      right: { title: string; rows: Row[] };
      footer: string;
      at: number[];
    });

export interface VideoScript {
  slug: string;
  tag: string;
  chapter: string;
  title: string;
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
