import React from "react";
import { color, fontStack, size } from "../theme.ts";
import type { Row } from "../videos/types.ts";
import { useReveal } from "./useReveal.ts";

interface Side {
  title: string;
  rows: Row[];
}

const Column: React.FC<{ side: Side; at: number; accent: string }> = ({ side, at, accent }) => {
  const { style } = useReveal(at);
  return (
    <div
      style={{
        ...style,
        flex: 1,
        background: "linear-gradient(160deg, rgba(52,46,158,0.5), rgba(33,28,106,0.5))",
        border: `2px solid ${accent}`,
        borderRadius: 28,
        padding: "40px 48px",
      }}
    >
      <div
        style={{
          fontFamily: fontStack.mono,
          fontSize: 52,
          fontWeight: 600,
          color: accent,
          marginBottom: 28,
        }}
      >
        {side.title}
      </div>
      {side.rows.map((row) => (
        <div
          key={row.label}
          style={{ padding: "18px 0", borderTop: "1px solid rgba(166,170,255,0.2)" }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: color.mute,
            }}
          >
            {row.label}
          </div>
          <div style={{ fontSize: 38, fontWeight: 600, marginTop: 4 }}>{row.value}</div>
        </div>
      ))}
    </div>
  );
};

export const Compare: React.FC<{ left: Side; right: Side; footer: string; at: number[] }> = ({
  left,
  right,
  footer,
  at,
}) => {
  const footerReveal = useReveal(at[2] ?? 0.8);
  return (
    <div
      style={{
        position: "absolute",
        left: size.margin,
        right: size.margin,
        top: size.top + 20,
        bottom: size.bottom + 110,
        display: "flex",
        gap: 40,
        fontFamily: fontStack.sans,
      }}
    >
      <Column side={left} at={at[0] ?? 0.1} accent={color.brand200} />
      <Column side={right} at={at[1] ?? 0.34} accent={color.warn} />
      <div
        style={{
          ...footerReveal.style,
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -96,
          textAlign: "center",
          fontSize: 32,
          fontWeight: 500,
          color: color.brand100,
        }}
      >
        {footer}
      </div>
    </div>
  );
};
