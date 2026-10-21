import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../theme.ts";
import { enterProgress } from "../motion.ts";
import type { Beat, Hazard, MapSpec } from "../videos/types.ts";
import { MAP_ORIGIN, MiniMap, place } from "./MiniMap.tsx";
import { HazardMark, type Tone } from "./shapes.tsx";
import { wrapText } from "./text.ts";

/** Where each failure lives in the system, as a chart's hazards: marked on the map, explained in the key. */
export const Hazards: React.FC<{
  map: MapSpec;
  hazards: (Hazard & { at: string })[];
  beats: Beat[];
}> = ({ map, hazards, beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const start = (i: number) => Math.round((beats[i]?.at ?? 0) * durationInFrames);
  const ps = hazards.map((_, i) => enterProgress(frame, start(i), fps));
  const current = ps.reduce((n, p, i) => (p > 0.05 ? i : n), -1);
  const places = new Map(map.places.map((p) => [p.id, place(p)]));

  const tones: Record<string, Tone> = {};
  if (current >= 0) tones[hazards[current]!.at] = "fault";

  const cols = hazards.length;
  const colW = (size.width - size.margin * 2) / cols;
  const titleSize = colW >= 420 ? 32 : 28;
  const bodySize = colW >= 420 ? 28 : 26;
  const titleChars = Math.max(12, Math.floor((colW - 90) / (titleSize * 0.54)));
  const bodyChars = Math.max(18, Math.floor((colW - 14) / (bodySize * 0.5)));

  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
      <MiniMap map={map} active={current} progress={() => 1} allLit />
      <g transform={`translate(${MAP_ORIGIN.x} ${MAP_ORIGIN.y})`}>
        {hazards.map((h, i) => {
          const p = places.get(h.at);
          if (!p) throw new Error(`Unknown place for hazard: ${h.at}`);
          const inside = p.w >= 400;
          return (
            <HazardMark
              key={h.title}
              x={inside ? p.x + p.w - 44 : p.x + p.w - 22}
              y={inside ? p.y + p.h / 2 : p.y - 6}
              n={i + 1}
              lit={ps[i]!}
            />
          );
        })}
      </g>
      {current >= 0 && (
        <g transform={`translate(${MAP_ORIGIN.x} ${MAP_ORIGIN.y})`}>
          {(() => {
            const p = places.get(hazards[current]!.at)!;
            return (
              <rect
                x={p.x - 6}
                y={p.y - 6}
                width={p.w + 12}
                height={p.h + 12}
                rx={16}
                fill="none"
                stroke={color.fault}
                strokeWidth={3}
                opacity={0.9}
              />
            );
          })()}
        </g>
      )}
      {hazards.map((h, i) => {
        const x = size.margin + i * colW;
        const body = wrapText(h.body, bodyChars);
        const title = wrapText(h.title, titleChars);
        return (
          <g key={h.title} opacity={0.3 + 0.7 * Math.min(ps[i]! * 1.4, 1)}>
            <HazardMark x={x + 28} y={742} n={i + 1} lit={1} />
            {title.map((l, k) => (
              <text
                key={k}
                x={x + 72}
                y={740 + k * 38}
                fontFamily={fontStack.display}
                fontWeight={700}
                fontSize={32}
                fill={color.ink}
              >
                {l}
              </text>
            ))}
            {body.map((l, k) => (
              <text
                key={k}
                x={x + 4}
                y={742 + 2 * 38 + 14 + k * 34}
                fontFamily={fontStack.sans}
                fontWeight={450}
                fontSize={28}
                fill={color.inkSoft}
                opacity={Math.min(ps[i]! * 1.4, 1)}
              >
                {l}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
};
