import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../theme.ts";
import { cameraProgress } from "../motion.ts";
import { useReveal } from "./useReveal.ts";

type Group = "route" | "meta" | "plain";

interface Props {
  lines: { text: string; group: Group }[];
  notes: { group: "route" | "meta"; title: string; body: string; at: number }[];
}

const GROUP_COLOR: Record<"route" | "meta", string> = { route: color.warn, meta: color.brand200 };

export const Anatomy: React.FC<Props> = ({ lines, notes }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const card = useReveal(0.04);

  // The group currently being explained is bright; the rest of the request dims.
  let active: "route" | "meta" | null = null;
  let activeStart = 0;
  for (const note of notes) {
    const start = Math.round(note.at * durationInFrames);
    if (frame >= start) {
      active = note.group;
      activeStart = start;
    }
  }
  const lift = active ? cameraProgress(frame, activeStart, fps) : 0;

  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: fontStack.sans }}>
      <div
        style={{
          ...card.style,
          position: "absolute",
          left: size.margin,
          top: size.top + 40,
          width: 1000,
          background: "rgba(8,6,32,0.72)",
          border: `2px solid ${color.brand700}`,
          borderRadius: 24,
          padding: "40px 48px",
          fontFamily: fontStack.mono,
          fontSize: 34,
          lineHeight: 1.65,
        }}
      >
        {lines.map((line, i) => {
          const isActive = active !== null && line.group === active;
          const opacity =
            active === null ? 1 : line.group === "plain" ? 0.45 : isActive ? 1 : 1 - 0.65 * lift;
          const tint = line.group === "plain" ? color.mute : GROUP_COLOR[line.group];
          return (
            <div
              key={i}
              style={{
                opacity,
                color: tint,
                whiteSpace: "pre",
                minHeight: "1.65em",
                fontWeight: isActive ? 600 : 500,
              }}
            >
              {line.text}
            </div>
          );
        })}
        <div style={{ marginTop: 22, fontSize: 24, color: color.mute, fontFamily: fontStack.sans }}>
          Illustrative shape, not a full message
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1160,
          right: size.margin,
          top: size.top + 40,
          display: "flex",
          flexDirection: "column",
          gap: 34,
        }}
      >
        {notes.map((note) => (
          <Note key={note.title} {...note} />
        ))}
      </div>
    </div>
  );
};

const Note: React.FC<{ group: "route" | "meta"; title: string; body: string; at: number }> = ({
  group,
  title,
  body,
  at,
}) => {
  const { style } = useReveal(at);
  return (
    <div
      style={{
        ...style,
        borderLeft: `6px solid ${GROUP_COLOR[group]}`,
        padding: "8px 0 8px 28px",
      }}
    >
      <div
        style={{ fontSize: 46, fontWeight: 750, color: GROUP_COLOR[group], letterSpacing: -0.4 }}
      >
        {title}
      </div>
      <div style={{ fontSize: 34, lineHeight: 1.4, color: color.brand100, marginTop: 10 }}>
        {body}
      </div>
    </div>
  );
};
