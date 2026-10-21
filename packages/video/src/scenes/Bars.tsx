import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../theme.ts";
import { enterProgress } from "../motion.ts";
import type { BarItem, Beat } from "../videos/types.ts";
import { useReveal } from "./useReveal.ts";

const TOP = 250;
const LABEL_X = 96;
const TRACK_X = 560;
const TRACK_W = 1000;

const TONE = { normal: color.brand300, route: color.route, fault: color.fault } as const;

/** Labelled values as bars on a chart: empty tracks from the first frame, filling as each is explained. */
export const Bars: React.FC<{
  items: BarItem[];
  caption?: string;
  max?: number;
  beats: Beat[];
}> = ({ items, caption, max, beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const top = max ?? Math.max(...items.map((i) => i.value));
  const rowH = Math.min(120, 600 / items.length);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
        {items.map((item, i) => {
          const p = enterProgress(frame, Math.round((beats[i]?.at ?? 0) * durationInFrames), fps);
          const y = TOP + i * rowH;
          const w = (TRACK_W * item.value) / top;
          const tint = TONE[item.tone ?? "normal"];
          return (
            <g key={item.label}>
              <text
                x={LABEL_X}
                y={y + 40}
                fill={color.ink}
                opacity={0.4 + 0.6 * Math.min(p * 1.4, 1)}
                fontFamily={fontStack.sans}
                fontWeight={650}
                fontSize={34}
              >
                {item.label}
              </text>
              <rect
                x={TRACK_X}
                y={y + 8}
                width={TRACK_W}
                height={46}
                rx={10}
                fill="none"
                stroke={color.brand600}
                strokeWidth={1.6}
                strokeDasharray="3 9"
                opacity={0.55}
              />
              <rect
                x={TRACK_X}
                y={y + 8}
                width={Math.max(0, w * Math.min(p, 1))}
                height={46}
                rx={10}
                fill={tint}
                opacity={0.9}
              />
              <text
                x={TRACK_X + Math.max(w * Math.min(p, 1), 0) + 20}
                y={y + 44}
                fill={tint}
                opacity={Math.min(p * 1.4, 1)}
                fontFamily={fontStack.display}
                fontWeight={800}
                fontSize={40}
              >
                {`${item.value}${item.unit ? ` ${item.unit}` : ""}`}
              </text>
              {item.note && (
                <text
                  x={LABEL_X}
                  y={y + 76}
                  fill={color.inkMute}
                  opacity={Math.min(p * 1.4, 1)}
                  fontFamily={fontStack.sans}
                  fontSize={24}
                >
                  {item.note}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {caption && <Caption text={caption} at={beats[items.length]?.at ?? 0.85} />}
    </div>
  );
};

const Caption: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const { opacity, lift } = useReveal(at, 0.3);
  return (
    <div
      style={{
        position: "absolute",
        left: size.margin,
        right: size.margin,
        top: 880,
        opacity,
        transform: `translateY(${lift}px)`,
        fontFamily: fontStack.display,
        fontStyle: "italic",
        fontWeight: 600,
        fontSize: 38,
        color: color.route,
      }}
    >
      {text}
    </div>
  );
};
