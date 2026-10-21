/** A laid-out diagram: fixed absolute positions, produced once by `scripts/layout-diagrams.ts`. */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidOutNode extends Box {
  id: string;
  kind: "node" | "group";
  label: string[];
  parent: string | null;
}

export interface LaidOutEdge {
  id: string;
  from: string;
  to: string;
  path: Point[];
  label: (Box & { lines: string[] }) | null;
  dashed: boolean;
  bidirectional: boolean;
}

export interface DiagramLayout {
  name: string;
  width: number;
  height: number;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
}

/**
 * One beat of a diagram build. `show` reveals elements, `focus` is what the camera frames and what
 * stays bright (everything else already shown dims), and `at` is the fraction of the scene at which
 * the beat starts. A cue phrase, once narration timestamps exist, replaces the estimated `at`.
 */
export interface DiagramStep {
  at: number;
  show: string[];
  focus?: string[];
  /** Frames the camera on these instead of `focus`, for when the brightest thing is not the whole picture. */
  camera?: string[];
  cue?: string;
}

/** One entry in a plate's key, naming a symbol the plate uses. */
export interface LegendItem {
  kind: "place" | "route" | "blocked" | "region";
  label: string;
}
