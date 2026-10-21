import React, { useMemo } from "react";
import { interpolate } from "remotion";
import { getLength, getPointAtLength } from "@remotion/paths";
import { color, fontStack, size } from "../../theme.ts";
import type { Beat } from "../../videos/types.ts";
import { Box, Check, Cross, Link } from "../shapes.tsx";
import { useBeat } from "../useReveal.ts";

const CLIENT = { x: 150, y: 450, w: 210, h: 92 };
const LB = { x: 520, y: 450, w: 250, h: 92 };
const INSTANCES = [
  { id: "A", x: 1010, y: 450, w: 360, h: 92, lines: ["Instance A", "holds the session"] },
  { id: "B", x: 1010, y: 266, w: 360, h: 92, lines: ["Instance B"] },
  { id: "C", x: 1010, y: 634, w: 360, h: 92, lines: ["Instance C"] },
];
const MID_Y = LB.y + LB.h / 2;
const JOG_X = 890;

/** Route a request takes to an instance, as polyline points. */
function routeTo(i: number) {
  const inst = INSTANCES[i]!;
  const y = inst.y + inst.h / 2;
  return [
    { x: CLIENT.x + CLIENT.w, y: MID_Y },
    { x: LB.x, y: MID_Y },
    { x: LB.x + LB.w, y: MID_Y },
    { x: JOG_X, y: MID_Y },
    { x: JOG_X, y },
    { x: inst.x, y },
  ];
}

const CAPTIONS = [
  "Works on your laptop: one replica, one session.",
  "Behind a load balancer, it fails. Intermittently.",
  "One replica holds the session. The others have never heard of it.",
  "MCP's 2026 revision removes the session.",
];

const SPAWN_EVERY = 30;
const FLIGHT = 66;
const FIRST = 14;

export const Hook: React.FC<{ beats: Beat[] }> = ({ beats }) => {
  const { active, frame, fps, durationInFrames } = useBeat(beats.map((b) => b.at));
  const routes = useMemo(() => INSTANCES.map((_, i) => routeTo(i)), []);
  const paths = useMemo(
    () => routes.map((pts) => `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`),
    [routes],
  );
  const lengths = useMemo(() => paths.map((p) => getLength(p)), [paths]);

  const balancedFrom = Math.round((beats[1]?.at ?? 0.3) * durationInFrames);
  const requests: { k: number; spawn: number; target: number }[] = [];
  let firstBalanced = -1;
  for (let k = 0; FIRST + k * SPAWN_EVERY <= frame; k++) {
    const spawn = FIRST + k * SPAWN_EVERY;
    if (spawn >= balancedFrom && firstBalanced < 0) firstBalanced = k;
    const target = firstBalanced < 0 ? 0 : (k - firstBalanced) % 3;
    requests.push({ k, spawn, target });
  }

  const balanced = active >= 1;
  const learned = active >= 2;
  const lit = (i: number) => (i === 0 || balanced ? 1 : 0);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
        <Link
          points={[
            { x: CLIENT.x + CLIENT.w, y: MID_Y },
            { x: INSTANCES[0]!.x, y: MID_Y },
          ]}
          draw={1}
          arrow="none"
        />
        <Box {...CLIENT} lines={["Client"]} lit={1} />
        {INSTANCES.map((inst, i) => (
          <React.Fragment key={inst.id}>
            {i > 0 && (
              <Link
                points={[
                  { x: LB.x + LB.w, y: MID_Y },
                  { x: JOG_X, y: MID_Y },
                  { x: JOG_X, y: inst.y + inst.h / 2 },
                  { x: inst.x, y: inst.y + inst.h / 2 },
                ]}
                draw={lit(i)}
                arrow="none"
              />
            )}
            <Box
              {...inst}
              lines={inst.lines}
              lit={lit(i)}
              tone={i === 0 && learned ? "route" : "normal"}
            />
          </React.Fragment>
        ))}
        <Box {...LB} lines={["Load balancer"]} lit={balanced ? 1 : 0} />

        {requests.map(({ k, spawn, target }) => {
          const u = (frame - spawn) / FLIGHT;
          if (u > 1.9) return null;
          const fails = target !== 0;
          const inst = INSTANCES[target]!;
          const end = { x: inst.x - 6, y: inst.y + inst.h / 2 };
          if (u <= 1) {
            const p = getPointAtLength(
              paths[target]!,
              Math.min(Math.max(u, 0), 1) * lengths[target]!,
            );
            if (!p) return null;
            return (
              <g key={k}>
                <circle cx={p.x} cy={p.y} r={17} fill={color.route} opacity={0.22} />
                <circle cx={p.x} cy={p.y} r={8} fill={color.brand50} />
              </g>
            );
          }
          const after = u - 1;
          const fade = interpolate(after, [0, 0.15, 0.9], [0, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <g key={k} opacity={fade}>
              {fails ? <Cross x={end.x - 24} y={end.y} /> : <Check x={end.x - 24} y={end.y} />}
              {fails && <ErrorTag x={inst.x + inst.w + 24} y={end.y} />}
            </g>
          );
        })}

        {learned && (
          <>
            <Note
              x={INSTANCES[1]!.x}
              y={INSTANCES[1]!.y + INSTANCES[1]!.h + 30}
              text="has no such session"
            />
            <Note
              x={INSTANCES[2]!.x}
              y={INSTANCES[2]!.y + INSTANCES[2]!.h + 30}
              text="has no such session"
            />
          </>
        )}
        <text
          x={size.width - size.margin}
          y={size.height - 150}
          textAnchor="end"
          fill={color.inkMute}
          fontFamily={fontStack.sans}
          fontSize={22}
          fontStyle="italic"
        >
          Illustrative: three replicas, requests spread round-robin.
        </text>
      </svg>

      <div
        style={{
          position: "absolute",
          left: size.margin,
          right: size.margin,
          bottom: 118,
          height: 130,
        }}
      >
        {CAPTIONS.map((line, i) => {
          const start = Math.round((beats[i]?.at ?? 0) * durationInFrames);
          const end = Math.round((beats[i + 1]?.at ?? 2) * durationInFrames);
          const o = interpolate(
            frame,
            [start, start + 8, end - 8, end],
            [i === 0 ? 1 : 0, 1, 1, i === CAPTIONS.length - 1 ? 1 : 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );
          const rise = interpolate(
            frame,
            [start, start + Math.round(fps * 0.5)],
            [i === 0 ? 0 : 14, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          return (
            <div
              key={line}
              style={{
                position: "absolute",
                inset: 0,
                opacity: o,
                transform: `translateY(${rise}px)`,
                fontFamily: fontStack.display,
                fontWeight: 700,
                fontSize: 54,
                lineHeight: 1.12,
                textWrap: "balance",
                color: i === 3 ? color.route : color.ink,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ErrorTag: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g>
    <rect
      x={x}
      y={y - 18}
      width={170}
      height={36}
      rx={8}
      fill={color.sea}
      stroke={color.fault}
      strokeWidth={1.8}
    />
    <text
      x={x + 85}
      y={y + 8}
      textAnchor="middle"
      fill={color.fault}
      fontFamily={fontStack.sans}
      fontSize={22}
      fontWeight={650}
    >
      unknown session
    </text>
  </g>
);

const Note: React.FC<{ x: number; y: number; text: string }> = ({ x, y, text }) => (
  <text
    x={x + 4}
    y={y}
    fill={color.fault}
    fontFamily={fontStack.display}
    fontStyle="italic"
    fontWeight={600}
    fontSize={28}
  >
    {text}
  </text>
);
