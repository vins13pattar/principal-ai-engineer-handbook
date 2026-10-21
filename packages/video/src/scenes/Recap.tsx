import React from "react";
import { color, fontStack, size } from "../theme.ts";
import type { Beat, Point } from "../videos/types.ts";
import { useReveal } from "./useReveal.ts";
import { wrapText } from "./text.ts";

const ROW_Y = [236, 458, 680];

/** The three things to keep, each beside a small drawing of the idea. */
export const Recap: React.FC<{ points: Point[]; footer: string; beats: Beat[] }> = ({
  points,
  footer,
  beats,
}) => (
  <div style={{ position: "absolute", inset: 0 }}>
    {points.map((p, i) => (
      <Row key={p.statement} point={p} index={i} at={beats[i]?.at ?? 0} y={ROW_Y[i]!} />
    ))}
    <Footer text={footer} at={beats[3]?.at ?? 0.8} />
  </div>
);

const Row: React.FC<{ point: Point; index: number; at: number; y: number }> = ({
  point,
  index,
  at,
  y,
}) => {
  const { opacity, lift } = useReveal(at, 0.3);
  const support = wrapText(point.support, 60);
  return (
    <div
      style={{
        position: "absolute",
        left: size.margin,
        top: y,
        right: size.margin,
        display: "flex",
        gap: 44,
        alignItems: "center",
        opacity,
        transform: `translateY(${lift}px)`,
      }}
    >
      <svg width={240} height={150} viewBox="0 0 240 150" style={{ flex: "none" }}>
        <Glyph index={index} {...(point.glyph ? { kind: point.glyph } : {})} />
      </svg>
      <div>
        <div
          style={{
            fontFamily: fontStack.display,
            fontWeight: 800,
            fontSize: 62,
            lineHeight: 1.05,
            letterSpacing: -0.5,
          }}
        >
          {point.statement}
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: fontStack.sans,
            fontWeight: 450,
            fontSize: 36,
            lineHeight: 1.3,
            color: color.inkSoft,
          }}
        >
          {support.join(" ")}
        </div>
      </div>
    </div>
  );
};

const Footer: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const { opacity } = useReveal(at, 0.35);
  return (
    <div
      style={{
        position: "absolute",
        left: size.margin,
        right: size.margin,
        top: 900,
        opacity,
        fontFamily: fontStack.display,
        fontStyle: "italic",
        fontWeight: 600,
        fontSize: 36,
        color: color.route,
      }}
    >
      {text}
    </div>
  );
};

const node = (x: number, y: number, w = 56, h = 40) => (
  <rect
    x={x}
    y={y}
    width={w}
    height={h}
    rx={9}
    fill={color.place}
    stroke={color.brand300}
    strokeWidth={2}
  />
);

const Glyph: React.FC<{ index: number; kind?: string }> = ({ index, kind }) => {
  const g = kind ?? (index === 0 ? "chain" : index === 1 ? "axis" : "fan");
  if (g === "chain") {
    return (
      <g>
        {node(10, 55)}
        {node(92, 55)}
        {node(174, 55)}
        <path d="M 66 75 L 92 75 M 148 75 L 174 75" stroke={color.route} strokeWidth={3} />
        <text
          x={38}
          y={128}
          textAnchor="middle"
          fill={color.inkMute}
          fontFamily={fontStack.sans}
          fontSize={20}
        >
          host
        </text>
        <text
          x={120}
          y={128}
          textAnchor="middle"
          fill={color.inkMute}
          fontFamily={fontStack.sans}
          fontSize={20}
        >
          client
        </text>
        <text
          x={202}
          y={128}
          textAnchor="middle"
          fill={color.inkMute}
          fontFamily={fontStack.sans}
          fontSize={20}
        >
          server
        </text>
      </g>
    );
  }
  if (g === "axis") {
    return (
      <g>
        <line x1={20} y1={75} x2={220} y2={75} stroke={color.brand500} strokeWidth={3} />
        {[40, 120, 200].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={75}
            r={13}
            fill={i === 1 ? color.route : color.sea}
            stroke={i === 1 ? color.route : color.brand400}
            strokeWidth={3}
          />
        ))}
        <text
          x={40}
          y={128}
          textAnchor="middle"
          fill={color.inkMute}
          fontFamily={fontStack.sans}
          fontSize={20}
        >
          model
        </text>
        <text
          x={120}
          y={128}
          textAnchor="middle"
          fill={color.inkMute}
          fontFamily={fontStack.sans}
          fontSize={20}
        >
          app
        </text>
        <text
          x={200}
          y={128}
          textAnchor="middle"
          fill={color.inkMute}
          fontFamily={fontStack.sans}
          fontSize={20}
        >
          user
        </text>
      </g>
    );
  }
  if (g === "loop") {
    return (
      <g fill="none" stroke={color.route} strokeWidth={3.4} strokeLinecap="round">
        <path d="M 150 75 A 50 36 0 1 1 120 40" />
        <path d="M 120 40 L 136 36 M 120 40 L 124 56" />
        <rect
          x={72}
          y={60}
          width={56}
          height={30}
          rx={8}
          fill={color.place}
          stroke={color.brand300}
          strokeWidth={2}
        />
      </g>
    );
  }
  if (g === "stack") {
    return (
      <g>
        {[20, 55, 90].map((y, i) => (
          <rect
            key={y}
            x={50 + i * 10}
            y={y}
            width={120}
            height={32}
            rx={9}
            fill={color.place}
            stroke={i === 0 ? color.route : color.brand300}
            strokeWidth={2}
          />
        ))}
      </g>
    );
  }
  if (g === "gate") {
    return (
      <g>
        <rect
          x={20}
          y={60}
          width={50}
          height={30}
          rx={8}
          fill={color.place}
          stroke={color.brand300}
          strokeWidth={2}
        />
        <rect x={104} y={30} width={10} height={90} rx={3} fill={color.brand400} />
        <rect x={128} y={30} width={10} height={90} rx={3} fill={color.brand400} />
        <rect
          x={170}
          y={60}
          width={50}
          height={30}
          rx={8}
          fill={color.place}
          stroke={color.brand300}
          strokeWidth={2}
        />
        <path d="M 70 75 L 104 75 M 138 75 L 170 75" stroke={color.route} strokeWidth={3} />
      </g>
    );
  }
  if (g === "split") {
    return (
      <g>
        <rect
          x={14}
          y={58}
          width={52}
          height={34}
          rx={9}
          fill={color.place}
          stroke={color.brand300}
          strokeWidth={2}
        />
        {[28, 92].map((y) => (
          <React.Fragment key={y}>
            <rect
              x={170}
              y={y - 14}
              width={52}
              height={34}
              rx={9}
              fill={color.place}
              stroke={color.brand300}
              strokeWidth={2}
            />
            <path
              d={`M 66 75 L 118 75 L 118 ${y + 3} L 170 ${y + 3}`}
              fill="none"
              stroke={color.route}
              strokeWidth={2.6}
            />
          </React.Fragment>
        ))}
      </g>
    );
  }
  if (g === "tick") {
    return (
      <g>
        <circle cx={120} cy={75} r={46} fill={color.place} stroke={color.ok} strokeWidth={3.4} />
        <path
          d="M 98 76 L 114 92 L 146 58"
          fill="none"
          stroke={color.ok}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }
  return (
    <g>
      {node(14, 55, 52, 40)}
      {[16, 55, 94].map((y) => (
        <React.Fragment key={y}>
          {node(170, y - 10 + 14, 52, 32)}
          <path
            d={`M 66 75 L 120 75 L 120 ${y + 20} L 170 ${y + 20}`}
            fill="none"
            stroke={color.route}
            strokeWidth={2.6}
          />
        </React.Fragment>
      ))}
    </g>
  );
};
