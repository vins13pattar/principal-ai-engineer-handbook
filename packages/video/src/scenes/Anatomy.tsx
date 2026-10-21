import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../theme.ts";
import { cameraProgress, enterProgress } from "../motion.ts";
import type { Beat } from "../videos/types.ts";
import { wrapText } from "./text.ts";
import { useBeat } from "./useReveal.ts";

type Group = "route" | "meta" | "plain";

interface Props {
  prose?: boolean;
  lines: { text: string; group: Group }[];
  notes: { group: "route" | "meta"; title: string; body: string }[];
  beats: Beat[];
}

const PANEL = { x: 96, y: 224, w: 1010 };
const LINE_H = 60;
const TOP = PANEL.y + 82;
const GROUP_COLOR: Record<"route" | "meta", string> = { route: color.route, meta: color.brand200 };

/** A request laid out as a chart legend: the code on the left, and each part explained on the right. */
export const Anatomy: React.FC<Props> = ({ prose = false, lines, notes, beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { active } = useBeat(beats.map((b) => b.at));
  const start = (i: number) => Math.round((beats[i]?.at ?? 0) * durationInFrames);
  const activeGroup = active >= 0 ? notes[active]!.group : null;
  const lift = active >= 0 ? cameraProgress(frame, start(active), fps) : 0;
  const height = lines.length * LINE_H + 120;
  // Each note starts below the one before it, whatever its length.
  const noteTops: number[] = [];
  notes.reduce((top, note) => {
    noteTops.push(top);
    return top + 56 + wrapText(note.body, 30).length * 44 + 70;
  }, 300);

  const span = (group: "route" | "meta") => {
    const idx = lines.map((l, i) => (l.group === group ? i : -1)).filter((i) => i >= 0);
    return { first: idx[0]!, last: idx.at(-1)! };
  };

  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
      <rect
        x={PANEL.x}
        y={PANEL.y}
        width={PANEL.w}
        height={height}
        rx={18}
        fill="rgba(5,4,26,0.78)"
        stroke={color.brand700}
        strokeWidth={1.8}
      />
      {lines.map((line, i) => {
        const isActive = activeGroup !== null && line.group === activeGroup;
        const opacity =
          activeGroup === null ? 1 : line.group === "plain" ? 0.5 : isActive ? 1 : 1 - 0.62 * lift;
        const tint = line.group === "plain" ? color.inkMute : GROUP_COLOR[line.group];
        return (
          <text
            key={i}
            x={PANEL.x + 44}
            y={TOP + i * LINE_H}
            fill={tint}
            opacity={opacity}
            fontFamily={prose ? fontStack.sans : fontStack.mono}
            fontWeight={isActive ? 650 : prose ? 500 : 500}
            fontSize={prose ? 36 : 33}
            style={{ whiteSpace: "pre" }}
          >
            {line.text}
          </text>
        );
      })}
      <text
        x={PANEL.x + 44}
        y={PANEL.y + height - 24}
        fill={color.inkMute}
        fontFamily={fontStack.sans}
        fontStyle="italic"
        fontSize={24}
      >
        Illustrative shape, not a full message.
      </text>

      {notes.map((note, i) => {
        const p = enterProgress(frame, start(i), fps);
        const { first, last } = span(note.group);
        const top = TOP + first * LINE_H - 34;
        const bottom = TOP + last * LINE_H + 14;
        const mid = (top + bottom) / 2;
        const noteY = noteTops[i]!;
        const tint = GROUP_COLOR[note.group];
        const body = wrapText(note.body, 30);
        return (
          <g key={note.title}>
            <g opacity={p}>
              <path
                d={`M ${PANEL.x + PANEL.w + 16} ${top} L ${PANEL.x + PANEL.w + 34} ${top} L ${PANEL.x + PANEL.w + 34} ${bottom} L ${PANEL.x + PANEL.w + 16} ${bottom}`}
                fill="none"
                stroke={tint}
                strokeWidth={3}
              />
              <path
                d={`M ${PANEL.x + PANEL.w + 34} ${mid} L 1196 ${mid} L 1196 ${noteY - 14} L 1226 ${noteY - 14}`}
                fill="none"
                stroke={tint}
                strokeWidth={3}
              />
            </g>
            <text
              x={1236}
              y={noteY}
              fontFamily={fontStack.display}
              fontWeight={800}
              fontSize={54}
              fill={tint}
              opacity={0.3 + 0.7 * Math.min(p * 1.4, 1)}
            >
              {note.title}
            </text>
            <g opacity={Math.min(p * 1.4, 1)}>
              {body.map((l, k) => (
                <text
                  key={k}
                  x={1236}
                  y={noteY + 56 + k * 44}
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
    </svg>
  );
};
