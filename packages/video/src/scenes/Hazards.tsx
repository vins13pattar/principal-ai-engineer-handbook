import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../theme.ts";
import { enterProgress } from "../motion.ts";
import type { Beat, Hazard } from "../videos/types.ts";
import { Box, HazardMark, Land, Link } from "./shapes.tsx";
import { wrapText } from "./text.ts";

const P = (x: number, y: number) => ({ x, y });
const CHAIN_Y = 475;
const ROWS = [
  { y: 350, text: "tool descriptions" },
  { y: 450, text: "tools/call handler" },
  { y: 550, text: "cached session state" },
];
/** Where each hazard sits on the map: [marker x, marker y, element it indicts]. */
const MARKERS: [number, number, "row0" | "row1" | "row2" | "lb"][] = [
  [1744, 385, "row0"],
  [1744, 485, "row1"],
  [855, 396, "lb"],
  [1744, 585, "row2"],
];

/** Where each failure lives in the system, as a chart's hazards: marked on the map, explained in the key. */
export const Hazards: React.FC<{ hazards: Hazard[]; beats: Beat[] }> = ({ hazards, beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const at = (i: number) =>
    enterProgress(frame, Math.round((beats[i]?.at ?? 0) * durationInFrames), fps);
  const ps = hazards.map((_, i) => at(i));
  const current = ps.reduce((n, p, i) => (p > 0.05 ? i : n), -1);
  const hit = (target: string) =>
    MARKERS.some(([, , t], i) => t === target && ps[i]! > 0.05 && i === current);

  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
      <Land x={1130} y={286} w={694} h={366} title="Server instance" lit={1} />
      <Box x={96} y={430} w={210} h={90} lines={["Model"]} lit={1} />
      <Box x={390} y={430} w={250} h={90} lines={["Host", "with clients"]} lit={1} fontSize={28} />
      <Box
        x={740}
        y={430}
        w={250}
        h={90}
        lines={["Load balancer"]}
        lit={1}
        tone={hit("lb") ? "fault" : "normal"}
      />
      <Link points={[P(306, CHAIN_Y), P(390, CHAIN_Y)]} draw={1} arrow="both" width={2.6} />
      <Link points={[P(640, CHAIN_Y), P(740, CHAIN_Y)]} draw={1} arrow="both" width={2.6} />
      <Link points={[P(990, CHAIN_Y), P(1130, CHAIN_Y)]} draw={1} arrow="both" width={2.6} />
      {ROWS.map((row, i) => (
        <Box
          key={row.text}
          x={1160}
          y={row.y}
          w={634}
          h={70}
          lines={[row.text]}
          lit={1}
          pin={false}
          fontSize={28}
          tone={hit(`row${i}`) ? "fault" : "normal"}
        />
      ))}
      <Link
        points={[P(1480, 286), P(1480, 244), P(201, 244), P(201, 430)]}
        draw={ps[0]!}
        tone="fault"
        arrow="end"
        width={3}
        dashed
      />
      <g opacity={ps[0]!}>
        <rect
          x={560}
          y={222}
          width={560}
          height={44}
          rx={9}
          fill={color.sea}
          stroke={color.fault}
          strokeWidth={1.6}
        />
        <text
          x={840}
          y={252}
          textAnchor="middle"
          fontFamily={fontStack.sans}
          fontWeight={550}
          fontSize={25}
          fill={color.fault}
        >
          descriptions enter the model&apos;s context
        </text>
      </g>
      {MARKERS.map(([x, y], i) => (
        <HazardMark key={i} x={x} y={y} n={i + 1} lit={ps[i]!} />
      ))}

      {hazards.map((h, i) => {
        const x = 96 + i * 440;
        const body = wrapText(h.body, 26);
        const title = wrapText(h.title, 22);
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
                y={742 + 2 * 38 + 14 + k * 36}
                fontFamily={fontStack.sans}
                fontWeight={450}
                fontSize={29}
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
