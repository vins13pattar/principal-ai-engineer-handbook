import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../../theme.ts";
import { enterProgress } from "../../motion.ts";
import type { Beat } from "../../videos/types.ts";
import { Box, Land } from "../shapes.tsx";
import { useBeat } from "../useReveal.ts";

const APPS = ["Chat app", "IDE", "Agent"];
const TOOLS = ["Filesystem", "GitHub", "Database"];
const BOX_W = 290;
const BOX_H = 92;
const LEFT_X = 190;
const RIGHT_X = 1440;
const Y0 = 330;
const GAP = 190;
const y = (i: number) => Y0 + i * GAP;

/** Every app wired to every tool, then one crossing. The river is the integration gap. */
export const Bridges: React.FC<{ beats: Beat[] }> = ({ beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { active } = useBeat(beats.map((b) => b.at));
  const standard = active >= 1;
  const clearStart = Math.round((beats[1]?.at ?? 0.5) * durationInFrames);
  const clear = interpolate(frame, [clearStart, clearStart + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cross = enterProgress(frame, clearStart + 8, fps);
  const wired = enterProgress(frame, 4, fps);
  const t = frame / fps;

  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
      <Land x={96} y={236} w={450} h={700} title="Applications" lit={1} />
      <Land x={1374} y={236} w={450} h={700} title="Tools and data" lit={1} />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M 560 ${300 + i * 215} ${Array.from({ length: 13 }, (_, k) => `L ${560 + (k * (1360 - 560)) / 12} ${300 + i * 215 + Math.sin(k * 0.9 + t * 0.9 + i * 2) * 10}`).join(" ")}`}
          fill="none"
          stroke={color.brand700}
          strokeWidth={1.6}
          opacity={0.55}
        />
      ))}
      <text
        x={960}
        y={266}
        textAnchor="middle"
        fill={color.inkMute}
        fontFamily={fontStack.display}
        fontStyle="italic"
        fontWeight={600}
        fontSize={30}
      >
        the integration gap
      </text>

      {APPS.flatMap((_, a) =>
        TOOLS.map((__, b) => {
          const x1 = LEFT_X + BOX_W;
          const y1 = y(a) + BOX_H / 2;
          const x2 = RIGHT_X;
          const y2 = y(b) + BOX_H / 2;
          const len = Math.hypot(x2 - x1, y2 - y1);
          return (
            <line
              key={`${a}-${b}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color.fault}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeDasharray={`${len}`}
              strokeDashoffset={len * (1 - wired)}
              opacity={(1 - clear) * 0.9}
            />
          );
        }),
      )}

      {APPS.map((label, i) => (
        <g key={label}>
          <Box x={LEFT_X} y={y(i)} w={BOX_W} h={BOX_H} lines={[label]} lit={1} fontSize={34} />
          <line
            x1={LEFT_X + BOX_W}
            y1={y(i) + BOX_H / 2}
            x2={700}
            y2={y(1) + BOX_H / 2}
            stroke={color.route}
            strokeWidth={4}
            opacity={cross}
            strokeLinecap="round"
          />
        </g>
      ))}
      {TOOLS.map((label, i) => (
        <g key={label}>
          <Box x={RIGHT_X} y={y(i)} w={BOX_W} h={BOX_H} lines={[label]} lit={1} fontSize={34} />
          <line
            x1={1220}
            y1={y(1) + BOX_H / 2}
            x2={RIGHT_X}
            y2={y(i) + BOX_H / 2}
            stroke={color.route}
            strokeWidth={4}
            opacity={cross}
            strokeLinecap="round"
          />
        </g>
      ))}

      <g opacity={cross}>
        <line
          x1={700}
          y1={y(1) + BOX_H / 2}
          x2={1220}
          y2={y(1) + BOX_H / 2}
          stroke={color.route}
          strokeWidth={16}
          strokeLinecap="round"
        />
        <line
          x1={700}
          y1={y(1) + BOX_H / 2 - 16}
          x2={1220}
          y2={y(1) + BOX_H / 2 - 16}
          stroke={color.route}
          strokeWidth={1.8}
          opacity={0.7}
        />
        <line
          x1={700}
          y1={y(1) + BOX_H / 2 + 16}
          x2={1220}
          y2={y(1) + BOX_H / 2 + 16}
          stroke={color.route}
          strokeWidth={1.8}
          opacity={0.7}
        />
        <rect
          x={880}
          y={y(1) + BOX_H / 2 - 38}
          width={160}
          height={76}
          rx={14}
          fill={color.sea}
          stroke={color.route}
          strokeWidth={3}
        />
        <text
          x={960}
          y={y(1) + BOX_H / 2 + 14}
          textAnchor="middle"
          fill={color.route}
          fontFamily={fontStack.display}
          fontWeight={800}
          fontSize={44}
        >
          MCP
        </text>
      </g>

      <text
        x={960}
        y={y(2) + BOX_H + 54}
        textAnchor="middle"
        fontFamily={fontStack.display}
        fontWeight={700}
        fontSize={46}
        fill={color.fault}
        opacity={1 - clear}
      >
        N × M custom integrations
      </text>
      <text
        x={960}
        y={y(2) + BOX_H + 54}
        textAnchor="middle"
        fontFamily={fontStack.display}
        fontWeight={700}
        fontSize={46}
        fill={color.route}
        opacity={cross}
      >
        N + M with one standard
      </text>
      {standard ? null : null}
    </svg>
  );
};
