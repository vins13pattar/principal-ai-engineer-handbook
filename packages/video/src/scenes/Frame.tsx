import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import "../fonts.ts";
import { color, fontStack, size } from "../theme.ts";
import { fadeIn } from "../motion.ts";

interface Props {
  tag: string;
  chapter: string;
  headline?: string;
  /** 0..1 progress through the whole video, drawn as the bottom rule. */
  progress?: number;
  children: React.ReactNode;
}

/** Shared chrome: background, module tag, chapter, headline, progress rule. */
export const Frame: React.FC<Props> = ({ tag, chapter, headline, progress = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1400px 900px at 78% 8%, ${color.brand900} 0%, ${color.brand950} 62%)`,
        fontFamily: fontStack.sans,
        color: color.ink,
      }}
    >
      <Grid />
      {children}
      <div
        style={{
          position: "absolute",
          left: size.margin,
          top: 54,
          display: "flex",
          gap: 18,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: fontStack.mono,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: 2,
            color: color.brand200,
            background: "rgba(108,92,231,0.18)",
            border: `1.5px solid ${color.brand500}`,
            borderRadius: 10,
            padding: "6px 16px",
          }}
        >
          {tag}
        </span>
        <span style={{ fontSize: 26, fontWeight: 500, color: color.mute }}>{chapter}</span>
      </div>
      {headline && (
        <div
          style={{
            position: "absolute",
            left: size.margin,
            top: 112,
            fontSize: 52,
            fontWeight: 750,
            letterSpacing: -0.8,
            opacity: fadeIn(frame, 0, Math.round(fps * 0.5)),
          }}
        >
          {headline}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 6,
          width: size.width,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ height: 6, width: size.width * progress, background: color.brand400 }} />
      </div>
    </AbsoluteFill>
  );
};

const Grid: React.FC = () => (
  <svg
    width={size.width}
    height={size.height}
    style={{ position: "absolute", inset: 0, opacity: 0.5 }}
  >
    <defs>
      <pattern id="dots" width="48" height="48" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.6" fill="rgba(166,170,255,0.16)" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#dots)" />
  </svg>
);
