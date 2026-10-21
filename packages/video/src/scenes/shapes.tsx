import React from "react";
import { color, fontStack } from "../theme.ts";

export type Tone = "normal" | "route" | "fault" | "ok";

const STROKE: Record<Tone, string> = {
  normal: color.brand300,
  route: color.route,
  fault: color.fault,
  ok: color.ok,
};

interface BoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  /** 0 = ghost outline only, 1 = fully drawn. */
  lit: number;
  tone?: Tone;
  fontSize?: number;
  /** The place marker on the box's left edge. */
  pin?: boolean;
}

const GHOST = 0.55;
const GHOST_TEXT = 0.34;

/** A place on the chart: a labelled chip with a pin, shown as a faint outline until lit. */
export const Box: React.FC<BoxProps> = ({
  x,
  y,
  w,
  h,
  lines,
  lit,
  tone = "normal",
  fontSize = 30,
  pin = true,
}) => {
  const stroke = STROKE[tone];
  const cy = y + h / 2;
  return (
    <g>
      <g opacity={1 - lit}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={12}
          fill="none"
          stroke={color.brand600}
          strokeWidth={1.6}
          opacity={GHOST}
        />
        {lines.map((line, i) => (
          <text
            key={i}
            x={x + w / 2 + (pin ? 4 : 0)}
            y={cy + (i - (lines.length - 1) / 2) * fontSize * 1.28 + fontSize * 0.34}
            textAnchor="middle"
            fill={color.inkSoft}
            opacity={GHOST_TEXT}
            fontFamily={fontStack.sans}
            fontSize={fontSize}
            fontWeight={i === 0 ? 650 : 450}
          >
            {line}
          </text>
        ))}
      </g>
      <g opacity={lit}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={12}
          fill={color.place}
          stroke={stroke}
          strokeWidth={tone === "normal" ? 1.8 : 3}
        />
        {pin && (
          <circle
            cx={x}
            cy={cy}
            r={8}
            fill={tone === "normal" ? color.sea : stroke}
            stroke={stroke}
            strokeWidth={2.5}
          />
        )}
        {lines.map((line, i) => (
          <text
            key={i}
            x={x + w / 2 + (pin ? 4 : 0)}
            y={cy + (i - (lines.length - 1) / 2) * fontSize * 1.28 + fontSize * 0.34}
            textAnchor="middle"
            fill={i === 0 ? color.ink : color.inkSoft}
            fontFamily={fontStack.sans}
            fontSize={fontSize}
            fontWeight={i === 0 ? 650 : 450}
          >
            {line}
          </text>
        ))}
      </g>
    </g>
  );
};

interface LinkProps {
  points: { x: number; y: number }[];
  /** 0 = ghost dashes, 1 = drawn. */
  draw: number;
  tone?: Tone;
  width?: number;
  dashed?: boolean;
  arrow?: "end" | "both" | "none";
  opacity?: number;
}

function path(points: { x: number; y: number }[], radius = 18): string {
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    d += ` L ${b.x - ((b.x - a.x) / l1) * r} ${b.y - ((b.y - a.y) / l1) * r} Q ${b.x} ${b.y} ${b.x + ((c.x - b.x) / l2) * r} ${b.y + ((c.y - b.y) / l2) * r}`;
  }
  const last = points.at(-1)!;
  return `${d} L ${last.x} ${last.y}`;
}

export function length(points: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return total;
}

function head(tip: { x: number; y: number }, from: { x: number; y: number }, size = 16): string {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x);
  const p1 = {
    x: tip.x + Math.cos(a + Math.PI - 0.42) * size,
    y: tip.y + Math.sin(a + Math.PI - 0.42) * size,
  };
  const p2 = {
    x: tip.x + Math.cos(a + Math.PI + 0.42) * size,
    y: tip.y + Math.sin(a + Math.PI + 0.42) * size,
  };
  return `M ${tip.x} ${tip.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`;
}

let maskCounter = 0;

/** A route between places: ghost dashes until drawn on, then a solid line with arrowheads. */
export const Link: React.FC<LinkProps> = ({
  points,
  draw,
  tone = "normal",
  width = 3,
  dashed = false,
  arrow = "end",
  opacity = 1,
}) => {
  const d = path(points);
  const total = length(points);
  const id = React.useMemo(() => `link-${maskCounter++}`, []);
  const stroke = STROKE[tone];
  const first = points[0]!;
  const last = points.at(-1)!;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color.brand600}
        strokeWidth={1.5}
        strokeDasharray="3 9"
        opacity={GHOST * (1 - draw)}
      />
      <g opacity={opacity}>
        <mask id={id} maskUnits="userSpaceOnUse" x={-50} y={-50} width={4000} height={4000}>
          <path
            d={d}
            stroke="white"
            strokeWidth={width + 14}
            fill="none"
            strokeDasharray={total}
            strokeDashoffset={total * (1 - draw)}
          />
        </mask>
        <g mask={`url(#${id})`}>
          <path
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={dashed ? "11 10" : undefined}
          />
        </g>
        {draw > 0.92 && arrow !== "none" && (
          <path d={head(last, points.at(-2) ?? first)} fill={stroke} />
        )}
        {draw > 0.92 && arrow === "both" && (
          <path d={head(first, points[1] ?? last)} fill={stroke} />
        )}
      </g>
    </g>
  );
};

export const Cross: React.FC<{ x: number; y: number; r?: number; tone?: Tone }> = ({
  x,
  y,
  r = 11,
  tone = "fault",
}) => (
  <g stroke={STROKE[tone]} strokeWidth={5} strokeLinecap="round">
    <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
    <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} />
  </g>
);

export const Check: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 11 }) => (
  <path
    d={`M ${x - r} ${y} L ${x - r / 3} ${y + r * 0.8} L ${x + r} ${y - r * 0.8}`}
    fill="none"
    stroke={color.ok}
    strokeWidth={5}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

/** A named region of the chart: a soft land fill with an italic title. */
export const Land: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  lit: number;
}> = ({ x, y, w, h, title, lit }) => (
  <g>
    <g opacity={1 - lit}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={28}
        fill="none"
        stroke={color.brand600}
        strokeWidth={1.6}
        strokeDasharray="3 9"
        opacity={GHOST}
      />
      {title && (
        <text
          x={x + 32}
          y={y + 52}
          fill={color.brand200}
          opacity={GHOST_TEXT}
          fontFamily={fontStack.display}
          fontStyle="italic"
          fontWeight={600}
          fontSize={30}
        >
          {title}
        </text>
      )}
    </g>
    <g opacity={lit}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={28}
        fill="rgba(79,70,229,0.10)"
        stroke={color.brand400}
        strokeOpacity={0.75}
        strokeWidth={1.6}
      />
      {title && (
        <text
          x={x + 32}
          y={y + 52}
          fill={color.brand200}
          fontFamily={fontStack.display}
          fontStyle="italic"
          fontWeight={600}
          fontSize={30}
        >
          {title}
        </text>
      )}
    </g>
  </g>
);

/** The key's hazard mark: a numbered triangle. */
export const HazardMark: React.FC<{ x: number; y: number; n: number; lit: number }> = ({
  x,
  y,
  n,
  lit,
}) => (
  <g opacity={lit} transform={`translate(${x} ${y}) scale(${0.7 + 0.3 * lit})`}>
    <path
      d="M 0 -30 L 28 20 L -28 20 Z"
      fill={color.sea}
      stroke={color.fault}
      strokeWidth={4}
      strokeLinejoin="round"
    />
    <text
      x={0}
      y={14}
      textAnchor="middle"
      fill={color.fault}
      fontFamily={fontStack.sans}
      fontSize={26}
      fontWeight={800}
    >
      {n}
    </text>
  </g>
);
