import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { summits } from "../contours.ts";
import "../fonts.ts";
import { color, fontStack, size } from "../theme.ts";

export interface RouteProgress {
  /** Where each scene starts along the whole video, 0 to 1. */
  starts: number[];
  /** Index of the scene on screen. */
  active: number;
  /** Position within the whole video, 0 to 1. */
  progress: number;
}

interface Props {
  plate: string;
  headline: string;
  seed: number;
  route: RouteProgress;
  children: React.ReactNode;
}

const OUTER = 24;
const INNER = 38;
const ROUTE_Y = 1008;

/**
 * The plate: a chart sheet the system is drawn on. The world owns this frame (ground, contours,
 * neatline, cartouche, route line); whatever a scene draws sits calmly inside it.
 */
export const Chart: React.FC<Props> = ({ plate, headline, seed, route, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const terrain = useMemo(() => summits(seed, 4, size.width, size.height), [seed]);
  const t = frame / fps;
  const drift = { x: Math.sin(t / 9) * 14, y: Math.cos(t / 11) * 9 };
  const long = headline.length > 40;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1500px 900px at 80% 0%, ${color.seaLift} 0%, ${color.sea} 66%)`,
        color: color.ink,
        fontFamily: fontStack.sans,
      }}
    >
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
        <g
          transform={`translate(${drift.x} ${drift.y})`}
          fill="none"
          stroke={color.brand800}
          strokeWidth={1.4}
        >
          {terrain.flatMap((s, i) =>
            s.rings.map((d, r) => <path key={`${i}-${r}`} d={d} opacity={0.5 - r * 0.045} />),
          )}
        </g>
        <Neatline />
      </svg>

      {children}

      <div
        style={{
          position: "absolute",
          left: size.margin,
          top: 64,
          maxWidth: 1380,
          fontFamily: fontStack.display,
          fontWeight: 800,
          fontSize: long ? 58 : 68,
          lineHeight: 1.04,
          letterSpacing: -0.6,
          textWrap: "balance",
        }}
      >
        {headline}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
          <div style={{ width: 84, height: 4, background: color.route, borderRadius: 2 }} />
          <div style={{ width: 360, height: 1.5, background: color.brand500, opacity: 0.6 }} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: size.margin,
          top: 82,
          fontFamily: fontStack.mono,
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: 3,
          color: color.inkMute,
        }}
      >
        {plate}
      </div>

      <RouteLine route={route} />
    </AbsoluteFill>
  );
};

const Neatline: React.FC = () => {
  const ticks: React.ReactNode[] = [];
  for (let x = INNER + 80; x < size.width - INNER; x += 80) {
    ticks.push(<line key={`t${x}`} x1={x} y1={INNER} x2={x} y2={INNER + 9} />);
    ticks.push(
      <line key={`b${x}`} x1={x} y1={size.height - INNER} x2={x} y2={size.height - INNER - 9} />,
    );
  }
  for (let y = INNER + 80; y < size.height - INNER; y += 80) {
    ticks.push(<line key={`l${y}`} x1={INNER} y1={y} x2={INNER + 9} y2={y} />);
    ticks.push(
      <line key={`r${y}`} x1={size.width - INNER} y1={y} x2={size.width - INNER - 9} y2={y} />,
    );
  }
  return (
    <g fill="none">
      <rect
        x={OUTER}
        y={OUTER}
        width={size.width - OUTER * 2}
        height={size.height - OUTER * 2}
        stroke={color.brand600}
        strokeWidth={2.5}
      />
      <rect
        x={INNER}
        y={INNER}
        width={size.width - INNER * 2}
        height={size.height - INNER * 2}
        stroke={color.brand500}
        strokeWidth={1}
        opacity={0.7}
      />
      <g stroke={color.brand400} strokeWidth={1.2} opacity={0.65}>
        {ticks}
      </g>
    </g>
  );
};

/** The video's own progress, drawn as the route a chart plots: a pin for every scene, the path lit to here. */
const RouteLine: React.FC<{ route: RouteProgress }> = ({ route }) => {
  const x0 = size.margin;
  const x1 = size.width - size.margin;
  const at = (f: number) => x0 + (x1 - x0) * f;
  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
      <line x1={x0} y1={ROUTE_Y} x2={x1} y2={ROUTE_Y} stroke={color.brand700} strokeWidth={2} />
      <line
        x1={x0}
        y1={ROUTE_Y}
        x2={at(route.progress)}
        y2={ROUTE_Y}
        stroke={color.route}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      {route.starts.map((f, i) => {
        const reached = i <= route.active;
        const current = i === route.active;
        return (
          <g key={i}>
            {current && (
              <circle
                cx={at(f)}
                cy={ROUTE_Y}
                r={13}
                fill="none"
                stroke={color.route}
                strokeWidth={2}
              />
            )}
            <circle
              cx={at(f)}
              cy={ROUTE_Y}
              r={current ? 7 : 5.5}
              fill={reached ? color.route : color.sea}
              stroke={reached ? color.route : color.brand500}
              strokeWidth={2}
            />
          </g>
        );
      })}
    </svg>
  );
};
