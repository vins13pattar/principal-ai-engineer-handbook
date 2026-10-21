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
  /** Where on the map it sits (hazards scene only). */
  at?: string;
}

export interface Point {
  statement: string;
  support: string;
  glyph?: Glyph;
}

export type Glyph = "chain" | "axis" | "fan" | "loop" | "stack" | "gate" | "split" | "tick";

/** A place on a hand-placed mini map. Coordinates are in the 1728 by 740 content area, origin at its top left. */
export interface MapPlace {
  id: string;
  label: string[];
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** The beat from which this place is lit. Before it, it shows as a ghost. */
  beat?: number;
  tone?: "normal" | "route" | "fault" | "ok";
}

export interface MapLink {
  from: string;
  to: string;
  beat?: number;
  tone?: "normal" | "route" | "fault";
  dashed?: boolean;
  arrow?: "end" | "both" | "none";
  label?: string;
}

export interface MapRegion {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  beat?: number;
}

export interface MapSpec {
  places: MapPlace[];
  links: MapLink[];
  regions?: MapRegion[];
}

/** Something that travels the map: a request, a message, a token. */
export interface Run {
  /** The beat at which it starts, repeating until the next beat. */
  beat: number;
  /** Routes taken in turn, as place ids. */
  paths: string[][];
  /** The outcome for each path, in turn. */
  results: ("ok" | "fail" | "stall")[];
  /** A label shown at the end place when a path fails or stalls. */
  mark?: string;
  /** Labels per path, in turn; overrides `mark`. */
  marks?: (string | undefined)[];
}

export interface Mark {
  beat: number;
  at: string;
  text: string;
  tone?: "fault" | "ok" | "route";
}

export interface Station {
  name: string;
  line: string;
  detail: string;
}

export interface Lane {
  title: string;
  subtitle?: string[];
  /** A region the chain sits inside, such as "One machine". */
  region?: string;
  chain: string[];
  /** A gate drawn on the route after the chain item at this index. */
  gate?: { after: number; label: string };
  routeLabel?: string;
  tone?: "normal" | "fault";
}

export interface BarItem {
  label: string;
  value: number;
  /** Shown beside the bar, e.g. "ms" or "tokens". */
  unit?: string;
  note?: string;
  tone?: "normal" | "route" | "fault";
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
      /** The layout's name, such as "06-mcp.host-client-server". */
      layout: string;
      steps: DiagramStep[];
      /** Edge ids drawn as a route that cannot be taken. */
      blocked?: string[];
      legend?: LegendItem[];
    })
  | (Base & {
      kind: "sequence";
      layout: string;
      /** Each step reveals messages up to and including item `upTo`. */
      steps: { at: number; upTo: number; cue?: string }[];
    })
  | (Base & {
      kind: "story";
      map: MapSpec;
      runs: Run[];
      marks?: Mark[];
      /** One caption per beat, shown large at the foot of the plate. */
      captions: string[];
      note?: string;
      beats: Beat[];
    })
  | (Base & { kind: "hazards"; map: MapSpec; hazards: (Hazard & { at: string })[]; beats: Beat[] })
  | (Base & {
      kind: "axis";
      ends: [string, string];
      stations: Station[];
      chip?: { label: string; from: number; to: number; captions: [string, string] };
      /** One beat per station, then one for the chip appearing and one for it moving. */
      beats: Beat[];
    })
  | (Base & { kind: "lanes"; lanes: Lane[]; takeaway?: string; beats: Beat[] })
  | (Base & { kind: "bars"; items: BarItem[]; caption?: string; max?: number; beats: Beat[] })
  | (Base & {
      kind: "anatomy";
      /** Set the lines in the text face instead of the code face, for a document rather than code. */
      prose?: boolean;
      lines: { text: string; group: "route" | "meta" | "plain" }[];
      notes: { group: "route" | "meta"; title: string; body: string }[];
      /** One beat per note, in order. */
      beats: Beat[];
    })
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
