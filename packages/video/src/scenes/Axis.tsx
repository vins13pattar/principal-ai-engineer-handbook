import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../theme.ts";
import { enterProgress } from "../motion.ts";
import type { Beat, Station } from "../videos/types.ts";
import { wrapText } from "./text.ts";
import { useBeat } from "./useReveal.ts";

const AXIS_Y = 600;

interface Props {
  ends: [string, string];
  stations: Station[];
  chip?: { label: string; from: number; to: number; captions: [string, string] };
  beats: Beat[];
}

/** A spectrum with named stations. An optional chip then slides from one station to another. */
export const Axis: React.FC<Props> = ({ ends, stations, chip, beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { active } = useBeat(beats.map((b) => b.at));
  const start = (i: number) => Math.round((beats[i]?.at ?? 0) * durationInFrames);
  const n = stations.length;
  const x0 = 360;
  const x1 = 1560;
  const xs = (i: number) => (n === 1 ? 960 : x0 + ((x1 - x0) * i) / (n - 1));
  const nameSize = n <= 3 ? 84 : n === 4 ? 70 : 58;
  const lineSize = n <= 3 ? 42 : n === 4 ? 36 : 32;
  const wrapAt = n <= 3 ? 27 : n === 4 ? 22 : 18;

  const chipIn = enterProgress(frame, start(n), fps);
  const slide = interpolate(frame, [start(n + 1), start(n + 1) + 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const chipX = chip ? xs(chip.from) + (xs(chip.to) - xs(chip.from)) * slide : 0;

  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
      <line x1={200} y1={AXIS_Y} x2={1720} y2={AXIS_Y} stroke={color.brand500} strokeWidth={3} />
      <path d={`M 190 ${AXIS_Y} L 214 ${AXIS_Y - 9} L 214 ${AXIS_Y + 9} Z`} fill={color.brand500} />
      <path
        d={`M 1730 ${AXIS_Y} L 1706 ${AXIS_Y - 9} L 1706 ${AXIS_Y + 9} Z`}
        fill={color.brand500}
      />
      <text
        x={200}
        y={AXIS_Y + 56}
        fill={color.inkMute}
        fontFamily={fontStack.display}
        fontStyle="italic"
        fontWeight={600}
        fontSize={28}
      >
        {ends[0]}
      </text>
      <text
        x={1720}
        y={AXIS_Y + 56}
        textAnchor="end"
        fill={color.inkMute}
        fontFamily={fontStack.display}
        fontStyle="italic"
        fontWeight={600}
        fontSize={28}
      >
        {ends[1]}
      </text>

      {stations.map((s, i) => {
        const p = enterProgress(frame, start(i), fps);
        const lit = active >= i;
        const rise = interpolate(p, [0, 1], [14, 0]);
        return (
          <g key={s.name}>
            <circle
              cx={xs(i)}
              cy={AXIS_Y}
              r={20}
              fill={lit ? color.route : color.sea}
              stroke={lit ? color.route : color.brand400}
              strokeWidth={4}
            />
            <line
              x1={xs(i)}
              y1={AXIS_Y - 20}
              x2={xs(i)}
              y2={AXIS_Y - 70}
              stroke={lit ? color.route : color.brand600}
              strokeWidth={2.5}
            />
            <text
              x={xs(i)}
              y={AXIS_Y - 190}
              textAnchor="middle"
              fontFamily={fontStack.display}
              fontWeight={800}
              fontSize={nameSize}
              fill={color.ink}
              opacity={0.3 + 0.7 * Math.min(p * 1.4, 1)}
            >
              {s.name}
            </text>
            <g opacity={Math.min(p * 1.4, 1)} transform={`translate(0 ${rise})`}>
              {wrapText(s.line, wrapAt + 6).map((l, k, all) => (
                <text
                  key={k}
                  x={xs(i)}
                  y={AXIS_Y - 118 - (all.length - 1 - k) * (lineSize + 4)}
                  textAnchor="middle"
                  fontFamily={fontStack.sans}
                  fontWeight={700}
                  fontSize={lineSize}
                  fill={color.route}
                >
                  {l}
                </text>
              ))}
              {wrapText(s.detail, wrapAt).map((l, k) => (
                <text
                  key={k}
                  x={xs(i)}
                  y={AXIS_Y + 130 + k * 42}
                  textAnchor="middle"
                  fontFamily={fontStack.sans}
                  fontWeight={450}
                  fontSize={34}
                  fill={color.inkSoft}
                >
                  {l}
                </text>
              ))}
            </g>
          </g>
        );
      })}

      {chip && (
        <>
          <g
            opacity={Math.min(chipIn * 1.5, 1)}
            transform={`translate(${chipX} ${AXIS_Y + 270 + interpolate(chipIn, [0, 1], [16, 0])})`}
          >
            <rect
              x={-150}
              y={-32}
              width={300}
              height={64}
              rx={12}
              fill={color.place}
              stroke={color.route}
              strokeWidth={3}
            />
            <text
              x={0}
              y={9}
              textAnchor="middle"
              fontFamily={fontStack.mono}
              fontWeight={500}
              fontSize={28}
              fill={color.ink}
            >
              {chip.label}
            </text>
          </g>
          <text
            x={chipX}
            y={AXIS_Y + 350}
            textAnchor="middle"
            fontFamily={fontStack.display}
            fontStyle="italic"
            fontWeight={600}
            fontSize={34}
            fill={color.route}
            opacity={Math.min(chipIn * 1.5, 1)}
          >
            {slide < 0.5 ? chip.captions[0] : chip.captions[1]}
          </text>
        </>
      )}
    </svg>
  );
};
