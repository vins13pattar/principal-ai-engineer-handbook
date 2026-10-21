import React, { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { getLength, getPointAtLength } from "@remotion/paths";
import { color, fontStack, size } from "../theme.ts";
import { enterProgress } from "../motion.ts";
import type { Beat, MapSpec, Mark, Run } from "../videos/types.ts";
import { Check, Cross } from "./shapes.tsx";
import { MAP_ORIGIN, MiniMap, place, pathFor, type Placed } from "./MiniMap.tsx";
import { useBeat } from "./useReveal.ts";

const SPAWN_EVERY = 30;
const FLIGHT = 66;
const TONE = { fault: color.fault, ok: color.ok, route: color.route } as const;

interface Props {
  map: MapSpec;
  runs: Run[];
  marks?: Mark[];
  captions: string[];
  note?: string;
  beats: Beat[];
}

/**
 * A short story told on a map: things travel along routes, some arrive and some do not, and a
 * caption per beat says what the viewer is watching. This is the opening hook of a video.
 */
export const Story: React.FC<Props> = ({ map, runs, marks = [], captions, note, beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { active } = useBeat(beats.map((b) => b.at));
  const start = (i: number) => Math.round((beats[i]?.at ?? 0) * durationInFrames);
  const places = useMemo(() => new Map(map.places.map((p) => [p.id, place(p)])), [map]);

  const paths = useMemo(
    () =>
      runs.map((run) =>
        run.paths.map((ids) => {
          const pts = pathFor(places, ids);
          const d = `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
          return { d, length: getLength(d), end: places.get(ids.at(-1)!)! as Placed };
        }),
      ),
    [runs, places],
  );

  const tokens: React.ReactNode[] = [];
  runs.forEach((run, r) => {
    const from = start(run.beat);
    const to = start(run.beat + 1) > from ? start(run.beat + 1) : durationInFrames;
    for (let k = 0; from + 10 + k * SPAWN_EVERY <= Math.min(frame, to + FLIGHT); k++) {
      const spawn = from + 10 + k * SPAWN_EVERY;
      if (spawn >= to) break;
      const i = k % run.paths.length;
      const path = paths[r]![i]!;
      const result = run.results[i] ?? "ok";
      const u = (frame - spawn) / FLIGHT;
      if (u < 0 || u > 1.9) continue;
      if (u <= 1) {
        const p = getPointAtLength(path.d, Math.min(u, 1) * path.length);
        if (!p) continue;
        tokens.push(
          <g key={`${r}-${k}`}>
            <circle cx={p.x} cy={p.y} r={17} fill={color.route} opacity={0.22} />
            <circle cx={p.x} cy={p.y} r={8} fill={color.brand50} />
          </g>,
        );
        continue;
      }
      const after = u - 1;
      const fade = interpolate(after, [0, 0.15, 0.9], [0, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const end = path.end;
      const ex = end.x - 26;
      const ey = end.y + end.h / 2;
      tokens.push(
        <g key={`${r}-${k}`} opacity={fade}>
          {result === "ok" && <Check x={ex} y={ey} />}
          {result === "fail" && <Cross x={ex} y={ey} />}
          {result === "stall" && (
            <g fill={color.route}>
              <circle cx={ex - 14} cy={ey} r={5} />
              <circle cx={ex} cy={ey} r={5} />
              <circle cx={ex + 14} cy={ey} r={5} />
            </g>
          )}
          {result !== "ok" && (run.marks?.[i] ?? run.mark) && (
            <g>
              <rect
                x={end.x + end.w + 20}
                y={ey - 18}
                width={(run.marks?.[i] ?? run.mark)!.length * 12.6 + 28}
                height={36}
                rx={8}
                fill={color.sea}
                stroke={result === "fail" ? color.fault : color.route}
                strokeWidth={1.8}
              />
              <text
                x={end.x + end.w + 34}
                y={ey + 8}
                fill={result === "fail" ? color.fault : color.route}
                fontFamily={fontStack.sans}
                fontSize={22}
                fontWeight={650}
              >
                {(run.marks?.[i] ?? run.mark)!}
              </text>
            </g>
          )}
        </g>,
      );
    }
  });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
        <MiniMap map={map} active={active} progress={(b) => enterProgress(frame, start(b), fps)} />
        <g transform={`translate(${MAP_ORIGIN.x} ${MAP_ORIGIN.y})`}>
          {marks.map((m) => {
            const p = places.get(m.at);
            if (!p) throw new Error(`Unknown place in mark: ${m.at}`);
            const o = enterProgress(frame, start(m.beat), fps);
            return (
              <text
                key={m.text + m.at}
                x={p.x + 4}
                y={p.y + p.h + 36}
                fill={TONE[m.tone ?? "fault"]}
                opacity={o}
                fontFamily={fontStack.display}
                fontStyle="italic"
                fontWeight={600}
                fontSize={28}
              >
                {m.text}
              </text>
            );
          })}
          {tokens}
        </g>
        {note && (
          <text
            x={size.width - size.margin}
            y={size.height - 150}
            textAnchor="end"
            fill={color.inkMute}
            fontFamily={fontStack.sans}
            fontSize={22}
            fontStyle="italic"
          >
            {note}
          </text>
        )}
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
        {captions.map((line, i) => {
          const s = start(i);
          const e = i + 1 < captions.length ? start(i + 1) : durationInFrames + 30;
          const o = interpolate(
            frame,
            [s, s + 8, e - 8, e],
            [i === 0 ? 1 : 0, 1, 1, i === captions.length - 1 ? 1 : 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const rise = interpolate(frame, [s, s + Math.round(fps * 0.5)], [i === 0 ? 0 : 14, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
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
                color: i === captions.length - 1 ? color.route : color.ink,
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
