import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../theme.ts";
import { enterProgress } from "../motion.ts";

const APPS = ["Chat app", "IDE", "Agent"];
const TOOLS = ["Filesystem", "GitHub", "Database"];

const LEFT = 330;
const RIGHT = 1260;
const TOP = 390;
const GAP = 170;
const BOX_W = 330;
const BOX_H = 96;

export const Fanout: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;

  // 0..0.5: every app wired to every tool. 0.5..0.62: the tangle clears. After: both sides meet at the protocol.
  const boxes = enterProgress(frame, 6, fps);
  const wired = enterProgress(frame, Math.round(durationInFrames * 0.12), fps);
  const clear = interpolate(t, [0.5, 0.62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hub = enterProgress(frame, Math.round(durationInFrames * 0.55), fps);
  const plain =
    interpolate(t, [0.2, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) *
    (1 - clear);

  const y = (i: number) => TOP + i * GAP;
  const cx = (LEFT + BOX_W + RIGHT) / 2;

  return (
    <svg
      width={size.width}
      height={size.height}
      style={{ position: "absolute", inset: 0, fontFamily: fontStack.sans }}
    >
      {APPS.flatMap((_, a) =>
        TOOLS.map((__, b) => (
          <line
            key={`${a}-${b}`}
            x1={LEFT + BOX_W}
            y1={y(a) + BOX_H / 2}
            x2={RIGHT}
            y2={y(b) + BOX_H / 2}
            stroke={color.danger}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={900}
            strokeDashoffset={900 * (1 - interpolate(wired, [0, 1], [0, 1]))}
            opacity={(1 - clear) * 0.85}
          />
        )),
      )}
      {APPS.map((_, i) => (
        <g key={`h1-${i}`} opacity={hub}>
          <path
            d={`M ${LEFT + BOX_W} ${y(i) + BOX_H / 2} L ${cx - 130} ${TOP + GAP + BOX_H / 2}`}
            stroke={color.brand300}
            strokeWidth={4}
            fill="none"
          />
          <path
            d={`M ${cx + 130} ${TOP + GAP + BOX_H / 2} L ${RIGHT} ${y(i) + BOX_H / 2}`}
            stroke={color.brand300}
            strokeWidth={4}
            fill="none"
          />
        </g>
      ))}
      {APPS.map((label, i) => (
        <Box key={label} x={LEFT} y={y(i)} label={label} progress={boxes} />
      ))}
      {TOOLS.map((label, i) => (
        <Box key={label} x={RIGHT} y={y(i)} label={label} progress={boxes} align="left" />
      ))}
      <g
        opacity={hub}
        transform={`translate(${cx} ${TOP + GAP + BOX_H / 2}) scale(${interpolate(hub, [0, 1], [0.85, 1])})`}
      >
        <rect
          x={-130}
          y={-70}
          width={260}
          height={140}
          rx={28}
          fill={color.brand600}
          stroke={color.brand200}
          strokeWidth={4}
        />
        <text textAnchor="middle" y={-4} fill={color.ink} fontSize={46} fontWeight={800}>
          MCP
        </text>
        <text textAnchor="middle" y={36} fill={color.brand100} fontSize={26} fontWeight={500}>
          one protocol
        </text>
      </g>
      <g opacity={plain}>
        <text
          x={960}
          y={TOP + GAP * 3 + 40}
          textAnchor="middle"
          fill={color.danger}
          fontSize={44}
          fontWeight={750}
        >
          N × M custom integrations
        </text>
      </g>
      <g opacity={hub}>
        <text
          x={960}
          y={TOP + GAP * 3 + 40}
          textAnchor="middle"
          fill={color.success}
          fontSize={44}
          fontWeight={750}
        >
          N + M with one standard
        </text>
      </g>
    </svg>
  );
};

const Box: React.FC<{ x: number; y: number; label: string; progress: number; align?: "left" }> = ({
  x,
  y,
  label,
  progress,
  align,
}) => (
  <g opacity={progress} transform={`translate(0 ${interpolate(progress, [0, 1], [16, 0])})`}>
    <rect
      x={x - (align === "left" ? 0 : 0)}
      y={y}
      width={BOX_W}
      height={BOX_H}
      rx={20}
      fill={color.brand900}
      stroke={color.brand400}
      strokeWidth={3}
    />
    <text
      x={x + BOX_W / 2}
      y={y + BOX_H / 2 + 12}
      textAnchor="middle"
      fill={color.ink}
      fontSize={36}
      fontWeight={650}
    >
      {label}
    </text>
  </g>
);
