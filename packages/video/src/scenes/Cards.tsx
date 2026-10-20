import React from "react";
import { color, fontStack, size } from "../theme.ts";
import type { Card } from "../videos/types.ts";
import { useReveal } from "./useReveal.ts";

const TONE = {
  default: { edge: color.brand400, chip: color.brand200, glow: "rgba(133,119,247,0.18)" },
  danger: { edge: color.danger, chip: color.danger, glow: "rgba(255,107,129,0.14)" },
  success: { edge: color.success, chip: color.success, glow: "rgba(76,212,160,0.14)" },
} as const;

const CardView: React.FC<{ card: Card; at: number; wide: boolean }> = ({ card, at, wide }) => {
  const { style } = useReveal(at);
  const tone = TONE[card.tone ?? "default"];
  return (
    <div
      style={{
        ...style,
        flex: 1,
        background: `linear-gradient(160deg, rgba(52,46,158,0.55), rgba(33,28,106,0.55))`,
        border: `2px solid ${tone.edge}`,
        borderRadius: 28,
        minHeight: wide ? 0 : 480,
        justifyContent: "flex-start",
        padding: wide ? "36px 40px" : "64px 44px",
        boxShadow: `0 0 60px ${tone.glow}`,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ fontSize: wide ? 44 : 58, fontWeight: 750, letterSpacing: -0.6 }}>
        {card.title}
      </div>
      {card.kicker && (
        <div style={{ fontSize: wide ? 30 : 42, fontWeight: 650, color: tone.chip }}>
          {card.kicker}
        </div>
      )}
      {card.body && (
        <div
          style={{
            fontSize: wide ? 30 : 36,
            lineHeight: 1.35,
            color: color.brand100,
            fontWeight: 400,
          }}
        >
          {card.body}
        </div>
      )}
    </div>
  );
};

export const Cards: React.FC<{
  cards: Card[];
  columns: number;
  at: number[];
  footer?: string;
  footerAt?: number;
}> = ({ cards, columns, at, footer, footerAt = 0.88 }) => {
  const footerReveal = useReveal(footerAt);
  const wide = cards.length > 3;
  const rows: Card[][] = [];
  for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns));
  return (
    <div
      style={{
        position: "absolute",
        left: size.margin,
        right: size.margin,
        top: size.top + 20,
        bottom: size.bottom + (footer ? 120 : 20),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 32,
        fontFamily: fontStack.sans,
      }}
    >
      {rows.map((row, r) => (
        <div key={r} style={{ display: "flex", gap: 32, flex: wide ? 1 : "0 0 auto" }}>
          {row.map((card, i) => (
            <CardView key={card.title} card={card} at={at[r * columns + i] ?? 0.5} wide={wide} />
          ))}
        </div>
      ))}
      {footer && (
        <div
          style={{
            ...footerReveal.style,
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -104,
            textAlign: "center",
            fontSize: 34,
            fontWeight: 500,
            color: color.brand100,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};
