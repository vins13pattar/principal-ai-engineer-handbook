import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../theme.ts";
import { enterProgress } from "../motion.ts";
import type { Beat, Lane } from "../videos/types.ts";
import { Box, Land, Link } from "./shapes.tsx";
import { wrapText } from "./text.ts";
import { useReveal } from "./useReveal.ts";

const TOP = 214;
const BOTTOM = 930;

/** Two or three ways of doing the same thing, drawn as routes side by side, with a takeaway under them. */
export const Lanes: React.FC<{ lanes: Lane[]; takeaway?: string; beats: Beat[] }> = ({
  lanes,
  takeaway,
  beats,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const at = (i: number) =>
    enterProgress(frame, Math.round((beats[i]?.at ?? 0) * durationInFrames), fps);
  const room = BOTTOM - TOP - (takeaway ? 90 : 0);
  const laneH = room / lanes.length;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
        {lanes.map((lane, i) => {
          const lit = at(i);
          const top = TOP + i * laneH;
          const h = laneH - 28;
          const mid = top + h / 2;
          const n = lane.chain.length;
          const chainW = 1080;
          const boxW = Math.min(300, (chainW - (n - 1) * 80) / n);
          const gap = n > 1 ? (chainW - boxW * n) / (n - 1) : 0;
          const bx = (k: number) => 130 + k * (boxW + gap);
          const tone = lane.tone === "fault" ? "fault" : "normal";
          return (
            <g key={lane.title}>
              {lane.region && (
                <Land x={96} y={top} w={chainW + 90} h={h} title={lane.region} lit={lit} />
              )}
              {lane.chain.map((label, k) => (
                <Box
                  key={k}
                  x={bx(k)}
                  y={mid - 40 + (lane.region ? 18 : 0)}
                  w={boxW}
                  h={80}
                  lines={wrapText(label, Math.max(8, Math.floor(boxW / 15)))}
                  lit={lit}
                  tone={tone}
                  fontSize={label.length > Math.floor(boxW / 15) * 2 ? 24 : 28}
                />
              ))}
              {lane.chain.slice(1).map((_, k) => (
                <Link
                  key={k}
                  points={[
                    { x: bx(k) + boxW, y: mid + (lane.region ? 18 : 0) },
                    { x: bx(k + 1), y: mid + (lane.region ? 18 : 0) },
                  ]}
                  draw={lit}
                  tone="route"
                  arrow="end"
                  width={3.4}
                />
              ))}
              {lane.gate && n > lane.gate.after + 1 && (
                <g opacity={lit}>
                  {(() => {
                    const gx = (bx(lane.gate.after) + boxW + bx(lane.gate.after + 1)) / 2;
                    const gy = mid + (lane.region ? 18 : 0);
                    return (
                      <>
                        <rect
                          x={gx - 22}
                          y={gy - 54}
                          width={12}
                          height={108}
                          rx={4}
                          fill={color.brand400}
                        />
                        <rect
                          x={gx + 10}
                          y={gy - 54}
                          width={12}
                          height={108}
                          rx={4}
                          fill={color.brand400}
                        />
                        <text
                          x={gx}
                          y={gy - 70}
                          textAnchor="middle"
                          fill={color.brand200}
                          fontFamily={fontStack.display}
                          fontStyle="italic"
                          fontWeight={600}
                          fontSize={26}
                        >
                          {lane.gate.label}
                        </text>
                      </>
                    );
                  })()}
                </g>
              )}
              {lane.routeLabel && (
                <text
                  x={130 + chainW / 2}
                  y={mid + (lane.region ? 18 : 0) + 76}
                  textAnchor="middle"
                  fill={color.route}
                  fontFamily={fontStack.sans}
                  fontWeight={550}
                  fontSize={24}
                  opacity={lit}
                >
                  {lane.routeLabel}
                </text>
              )}
              <g opacity={0.3 + 0.7 * Math.min(lit * 1.4, 1)}>
                <text
                  x={1290}
                  y={mid - (lane.subtitle?.length ?? 0) * 22 + 6}
                  fontFamily={fontStack.display}
                  fontWeight={800}
                  fontSize={Math.min(60, Math.floor(520 / (lane.title.length * 0.53)))}
                  fill={tone === "fault" ? color.fault : color.ink}
                >
                  {lane.title}
                </text>
                {(lane.subtitle ?? [])
                  .flatMap((s) => wrapText(s, 32))
                  .map((l, k) => (
                    <text
                      key={k}
                      x={1290}
                      y={mid + 44 + k * 40 - (lane.subtitle?.length ?? 0) * 22 + 6}
                      fontFamily={fontStack.sans}
                      fontWeight={450}
                      fontSize={32}
                      fill={color.inkSoft}
                    >
                      {l}
                    </text>
                  ))}
              </g>
            </g>
          );
        })}
      </svg>
      {takeaway && <Takeaway text={takeaway} at={beats[lanes.length]?.at ?? 0.85} />}
    </div>
  );
};

const Takeaway: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const { opacity, lift } = useReveal(at, 0.3);
  return (
    <div
      style={{
        position: "absolute",
        left: size.margin,
        right: size.margin,
        top: BOTTOM - 62,
        opacity,
        transform: `translateY(${lift}px)`,
        fontFamily: fontStack.display,
        fontStyle: "italic",
        fontWeight: 600,
        fontSize: 38,
        color: color.route,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
};
