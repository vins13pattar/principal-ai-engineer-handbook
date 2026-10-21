import React from "react";
import type { MapLink, MapPlace, MapSpec } from "../videos/types.ts";
import { Box, Land, Link, type Tone } from "./shapes.tsx";

export const MAP_ORIGIN = { x: 96, y: 204 };
const W = 230;
const H = 92;

export interface Placed extends MapPlace {
  w: number;
  h: number;
}

export function place(p: MapPlace): Placed {
  return { ...p, w: p.w ?? W, h: p.h ?? H };
}

type Pt = { x: number; y: number };

/** The route a link takes between two places, as polyline points in map coordinates. */
export function route(a: Placed, b: Placed): Pt[] {
  const acy = a.y + a.h / 2;
  const bcy = b.y + b.h / 2;
  if (b.x >= a.x + a.w) {
    const mid = (a.x + a.w + b.x) / 2;
    return acy === bcy
      ? [
          { x: a.x + a.w, y: acy },
          { x: b.x, y: bcy },
        ]
      : [
          { x: a.x + a.w, y: acy },
          { x: mid, y: acy },
          { x: mid, y: bcy },
          { x: b.x, y: bcy },
        ];
  }
  if (b.x + b.w <= a.x) {
    const mid = (b.x + b.w + a.x) / 2;
    return acy === bcy
      ? [
          { x: a.x, y: acy },
          { x: b.x + b.w, y: bcy },
        ]
      : [
          { x: a.x, y: acy },
          { x: mid, y: acy },
          { x: mid, y: bcy },
          { x: b.x + b.w, y: bcy },
        ];
  }
  const acx = a.x + a.w / 2;
  const bcx = b.x + b.w / 2;
  const down = b.y > a.y;
  const y1 = down ? a.y + a.h : a.y;
  const y2 = down ? b.y : b.y + b.h;
  const mid = (y1 + y2) / 2;
  return acx === bcx
    ? [
        { x: acx, y: y1 },
        { x: bcx, y: y2 },
      ]
    : [
        { x: acx, y: y1 },
        { x: acx, y: mid },
        { x: bcx, y: mid },
        { x: bcx, y: y2 },
      ];
}

export function pathFor(places: Map<string, Placed>, ids: string[]): Pt[] {
  const pts: Pt[] = [];
  for (let i = 1; i < ids.length; i++) {
    const a = places.get(ids[i - 1]!);
    const b = places.get(ids[i]!);
    if (!a || !b) throw new Error(`Unknown place in path: ${ids[i - 1]} -> ${ids[i]}`);
    pts.push(...route(a, b));
  }
  return pts;
}

interface Props {
  map: MapSpec;
  /** The current beat, or -1 before the first. */
  active: number;
  /** How far each beat has progressed, 0 to 1, indexed by beat. */
  progress: (beat: number) => number;
  /** Tone overrides by place id, for highlighting. */
  tones?: Record<string, Tone>;
  /** Make everything lit regardless of beat. */
  allLit?: boolean;
}

/** A hand-placed map: regions, places, and the links between them, lit beat by beat. */
export const MiniMap: React.FC<Props> = ({ map, progress, tones = {}, allLit = false }) => {
  const placed = new Map(map.places.map((p) => [p.id, place(p)]));
  const lit = (beat: number | undefined) => (allLit ? 1 : progress(beat ?? 0));
  return (
    <g transform={`translate(${MAP_ORIGIN.x} ${MAP_ORIGIN.y})`}>
      {(map.regions ?? []).map((r) => (
        <Land key={r.title} x={r.x} y={r.y} w={r.w} h={r.h} title={r.title} lit={lit(r.beat)} />
      ))}
      {map.links.map((l: MapLink, i) => {
        const a = placed.get(l.from);
        const b = placed.get(l.to);
        if (!a || !b) throw new Error(`Unknown place in link: ${l.from} -> ${l.to}`);
        const beat = l.beat ?? Math.max(a.beat ?? 0, b.beat ?? 0);
        return (
          <Link
            key={i}
            points={route(a, b)}
            draw={lit(beat)}
            tone={l.tone ?? "normal"}
            dashed={l.dashed ?? false}
            arrow={l.arrow ?? "none"}
            width={2.8}
          />
        );
      })}
      {[...placed.values()].map((p) => (
        <Box
          key={p.id}
          x={p.x}
          y={p.y}
          w={p.w}
          h={p.h}
          lines={p.label}
          lit={lit(p.beat)}
          tone={tones[p.id] ?? p.tone ?? "normal"}
          fontSize={p.h < 70 ? 26 : 30}
        />
      ))}
    </g>
  );
};
