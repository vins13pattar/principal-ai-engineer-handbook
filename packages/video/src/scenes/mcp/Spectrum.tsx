import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../../theme.ts";
import { enterProgress } from "../../motion.ts";
import type { Beat } from "../../videos/types.ts";
import { wrapText } from "../text.ts";
import { useBeat } from "../useReveal.ts";

const AXIS_Y = 600;
const STATIONS = [
  {
    x: 360,
    name: "Tools",
    owner: "The model decides",
    detail: "Function calls, standardized across servers",
  },
  {
    x: 960,
    name: "Resources",
    owner: "The application decides",
    detail: "Files, database rows, search results",
  },
  {
    x: 1560,
    name: "Prompts",
    owner: "The user decides",
    detail: "Templates, often slash commands",
  },
];

/**
 * Who decides to invoke a capability, laid out as a line from the model to the user. The chip at the
 * end slides along it: the same capability, handed to a different owner.
 */
export const Spectrum: React.FC<{ beats: Beat[] }> = ({ beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { active } = useBeat(beats.map((b) => b.at));
  const start = (i: number) => Math.round((beats[i]?.at ?? 0) * durationInFrames);

  const chipIn = enterProgress(frame, start(3), fps);
  const slide = interpolate(frame, [start(4), start(4) + 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const chipX = STATIONS[1]!.x + (STATIONS[0]!.x - STATIONS[1]!.x) * slide;

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
        the model holds the decision
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
        the user holds the decision
      </text>

      {STATIONS.map((s, i) => {
        const p = enterProgress(frame, start(i), fps);
        const lit = active >= i;
        const rise = interpolate(p, [0, 1], [14, 0]);
        return (
          <g key={s.name}>
            <circle
              cx={s.x}
              cy={AXIS_Y}
              r={20}
              fill={lit ? color.route : color.sea}
              stroke={lit ? color.route : color.brand400}
              strokeWidth={4}
            />
            <line
              x1={s.x}
              y1={AXIS_Y - 20}
              x2={s.x}
              y2={AXIS_Y - 70}
              stroke={lit ? color.route : color.brand600}
              strokeWidth={2.5}
            />
            <text
              x={s.x}
              y={AXIS_Y - 190}
              textAnchor="middle"
              fontFamily={fontStack.display}
              fontWeight={800}
              fontSize={84}
              fill={color.ink}
              opacity={0.3 + 0.7 * Math.min(p * 1.4, 1)}
            >
              {s.name}
            </text>
            <g opacity={Math.min(p * 1.4, 1)} transform={`translate(0 ${rise})`}>
              <text
                x={s.x}
                y={AXIS_Y - 118}
                textAnchor="middle"
                fontFamily={fontStack.sans}
                fontWeight={700}
                fontSize={42}
                fill={color.route}
              >
                {s.owner}
              </text>
              {wrapText(s.detail, 27).map((l, k) => (
                <text
                  key={k}
                  x={s.x}
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

      <g
        opacity={Math.min(chipIn * 1.5, 1)}
        transform={`translate(${chipX} ${AXIS_Y + 250 + interpolate(chipIn, [0, 1], [16, 0])})`}
      >
        <rect
          x={-120}
          y={-30}
          width={240}
          height={60}
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
          read this file
        </text>
      </g>
      <text
        x={chipX}
        y={AXIS_Y + 330}
        textAnchor="middle"
        fontFamily={fontStack.display}
        fontStyle="italic"
        fontWeight={600}
        fontSize={34}
        fill={color.route}
        opacity={Math.min(chipIn * 1.5, 1)}
      >
        {slide < 0.5 ? "as a resource, the host stays in control" : "as a tool, the model decides"}
      </text>
    </svg>
  );
};
