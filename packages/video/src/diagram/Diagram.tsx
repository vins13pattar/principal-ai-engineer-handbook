import React, { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { getLength, getPointAtLength } from "@remotion/paths";
import { cameraProgress, enterProgress, fadeIn, STAGGER } from "../motion.ts";
import { color, fontStack, size } from "../theme.ts";
import type { DiagramLayout, DiagramStep, LaidOutEdge, LaidOutNode, Point } from "./types.ts";

const NODE_FONT = 30;
const EDGE_FONT = 24;
const GROUP_FONT = 26;
const DIM = 0.28;
const ARROW = 16;

interface Props {
  layout: DiagramLayout;
  steps: DiagramStep[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function roundedPath(points: Point[], radius = 18): string {
  if (points.length < 2) return "";
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const here = points[i]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(here.x - prev.x, here.y - prev.y);
    const outLen = Math.hypot(next.x - here.x, next.y - here.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a = {
      x: here.x - ((here.x - prev.x) / inLen) * r,
      y: here.y - ((here.y - prev.y) / inLen) * r,
    };
    const b = {
      x: here.x + ((next.x - here.x) / outLen) * r,
      y: here.y + ((next.y - here.y) / outLen) * r,
    };
    d += ` L ${a.x} ${a.y} Q ${here.x} ${here.y} ${b.x} ${b.y}`;
  }
  const last = points.at(-1)!;
  return `${d} L ${last.x} ${last.y}`;
}

function arrowHead(tip: Point, from: Point): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const left = angle + Math.PI - 0.42;
  const right = angle + Math.PI + 0.42;
  const p1 = { x: tip.x + Math.cos(left) * ARROW, y: tip.y + Math.sin(left) * ARROW };
  const p2 = { x: tip.x + Math.cos(right) * ARROW, y: tip.y + Math.sin(right) * ARROW };
  return `M ${tip.x} ${tip.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`;
}

function boundsOf(rects: Rect[]): Rect {
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function edgeBox(edge: LaidOutEdge): Rect {
  const xs = edge.path.map((p) => p.x);
  const ys = edge.path.map((p) => p.y);
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
  return edge.label ? boundsOf([box, edge.label]) : box;
}

/** Everything a step makes visible, plus the camera framing for it. */
function resolveSteps(layout: DiagramLayout, steps: DiagramStep[]) {
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(layout.edges.map((e) => [e.id, e]));
  const boxOf = (id: string): Rect => {
    const node = nodeById.get(id);
    if (node) return node;
    const edge = edgeById.get(id);
    if (edge) return edgeBox(edge);
    throw new Error(`Diagram ${layout.name}: unknown element "${id}"`);
  };
  return steps.map((step) => {
    for (const id of [...step.show, ...(step.focus ?? []), ...(step.camera ?? [])]) boxOf(id);
    const focus = step.focus ?? step.show;
    return { ...step, focus, frame: boundsOf((step.camera ?? focus).map(boxOf)) };
  });
}

function fitCamera(rect: Rect, area: Rect, maxScale: number) {
  const pad = 90;
  const scale = Math.min(area.w / (rect.w + pad * 2), area.h / (rect.h + pad * 2), maxScale);
  return {
    scale,
    cx: rect.x + rect.w / 2,
    cy: rect.y + rect.h / 2,
  };
}

export const Diagram: React.FC<Props & { durationInFrames: number }> = ({
  layout,
  steps,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const resolved = useMemo(() => resolveSteps(layout, steps), [layout, steps]);
  const startFrames = resolved.map((s) => Math.round(s.at * durationInFrames));

  const area: Rect = { x: 0, y: size.top, w: size.width, h: size.height - size.top - size.bottom };

  // Camera: interpolate between the previous step's framing and this one's.
  let active = -1;
  for (let i = 0; i < resolved.length; i++) if (frame >= startFrames[i]!) active = i;
  const cams = resolved.map((s) => fitCamera(s.frame, area, 1.35));
  const cam = (() => {
    if (active < 0) return cams[0]!;
    const to = cams[active]!;
    const from = cams[Math.max(active - 1, 0)]!;
    const p = active === 0 ? 1 : cameraProgress(frame, startFrames[active]!, fps);
    return {
      scale: from.scale + (to.scale - from.scale) * p,
      cx: from.cx + (to.cx - from.cx) * p,
      cy: from.cy + (to.cy - from.cy) * p,
    };
  })();

  // First step that shows an element decides when it enters.
  const entry = new Map<string, { step: number; index: number }>();
  resolved.forEach((s, step) =>
    s.show.forEach((id, index) => {
      if (!entry.has(id)) entry.set(id, { step, index });
    }),
  );

  // Brightness: focused in the active step => 1, shown but not focused => dimmed.
  const brightness = (id: string): number => {
    const e = entry.get(id);
    if (!e || active < e.step) return 0;
    const target = (step: number) => (resolved[step]!.focus.includes(id) ? 1 : DIM);
    if (active === 0) return target(0);
    const p = cameraProgress(frame, startFrames[active]!, fps);
    const before = active - 1 < e.step ? 1 : target(active - 1);
    return before + (target(active) - before) * p;
  };
  const progress = (id: string): number => {
    const e = entry.get(id);
    if (!e) return 0;
    return enterProgress(frame, startFrames[e.step]! + e.index * STAGGER, fps);
  };

  const tx = size.width / 2 - cam.cx * cam.scale;
  const ty = area.y + area.h / 2 - cam.cy * cam.scale;

  const groups = layout.nodes.filter((n) => n.kind === "group");
  const leaves = layout.nodes.filter((n) => n.kind === "node");

  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(${tx} ${ty}) scale(${cam.scale})`}>
        {groups.map((g) => (
          <GroupShape key={g.id} node={g} opacity={brightness(g.id)} progress={progress(g.id)} />
        ))}
        {layout.edges.map((e) => (
          <EdgeShape
            key={e.id}
            edge={e}
            opacity={brightness(e.id)}
            progress={progress(e.id)}
            active={active >= 0 && resolved[active]!.focus.includes(e.id)}
            frame={frame}
            fps={fps}
          />
        ))}
        {leaves.map((n) => (
          <NodeShape
            key={n.id}
            node={n}
            opacity={brightness(n.id)}
            progress={progress(n.id)}
            active={active >= 0 && resolved[active]!.focus.includes(n.id)}
          />
        ))}
      </g>
    </svg>
  );
};

const GroupShape: React.FC<{ node: LaidOutNode; opacity: number; progress: number }> = ({
  node,
  opacity,
  progress,
}) => (
  <g opacity={opacity * Math.min(progress * 1.4, 1)}>
    <rect
      x={node.x}
      y={node.y}
      width={node.w}
      height={node.h}
      rx={28}
      fill="rgba(108,92,231,0.07)"
      stroke={color.brand400}
      strokeOpacity={0.55}
      strokeWidth={2}
      strokeDasharray="10 10"
    />
    {node.label.map((line, i) => (
      <text
        key={i}
        x={node.x + 32}
        y={node.y + 50 + i * GROUP_FONT * 1.3}
        fill={color.brand200}
        fontFamily={fontStack.sans}
        fontSize={GROUP_FONT}
        fontWeight={600}
        letterSpacing={0.4}
      >
        {line}
      </text>
    ))}
  </g>
);

const NodeShape: React.FC<{
  node: LaidOutNode;
  opacity: number;
  progress: number;
  active: boolean;
}> = ({ node, opacity, progress, active }) => {
  const lift = interpolate(progress, [0, 1], [14, 0]);
  const scale = interpolate(progress, [0, 1], [0.94, 1]);
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  return (
    <g
      opacity={opacity * Math.min(progress * 1.6, 1)}
      transform={`translate(${cx} ${cy + lift}) scale(${scale}) translate(${-cx} ${-cy})`}
      filter={active ? "url(#glow)" : undefined}
    >
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        rx={18}
        fill={color.brand900}
        stroke={active ? color.brand200 : color.brand400}
        strokeWidth={active ? 3.5 : 2.5}
      />
      {node.label.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={cy + (i - (node.label.length - 1) / 2) * NODE_FONT * 1.3 + NODE_FONT * 0.36}
          textAnchor="middle"
          fill={color.ink}
          fontFamily={fontStack.sans}
          fontSize={NODE_FONT}
          fontWeight={i === 0 ? 650 : 450}
        >
          {line}
        </text>
      ))}
    </g>
  );
};

const EdgeShape: React.FC<{
  edge: LaidOutEdge;
  opacity: number;
  progress: number;
  active: boolean;
  frame: number;
  fps: number;
}> = ({ edge, opacity, progress, active, frame, fps }) => {
  const d = useMemo(() => roundedPath(edge.path), [edge]);
  const length = useMemo(() => getLength(d), [d]);
  const maskId = `reveal-${edge.id}`;
  const draw = Math.min(progress, 1);
  const first = edge.path[0]!;
  const last = edge.path.at(-1)!;
  const stroke = active ? color.brand200 : color.brand300;

  // A pulse travels the focused edge so direction and flow read without a legend.
  const loop = fps * 2.4;
  const t = (frame % loop) / loop;
  const pulse = active && progress > 0.95 ? getPointAtLength(d, t * length) : null;

  return (
    <g opacity={opacity}>
      <mask id={maskId} maskUnits="userSpaceOnUse" x={-50} y={-50} width={6000} height={6000}>
        <path
          d={d}
          stroke="white"
          strokeWidth={16}
          fill="none"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - draw)}
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={active ? 4 : 3}
          strokeLinecap="round"
          strokeDasharray={edge.dashed ? "4 12" : undefined}
        />
      </g>
      {draw > 0.9 && (
        <g opacity={fadeIn(draw, 0.9, 0.1)}>
          <path d={arrowHead(last, edge.path.at(-2) ?? first)} fill={stroke} />
          {edge.bidirectional && <path d={arrowHead(first, edge.path[1] ?? last)} fill={stroke} />}
        </g>
      )}
      {pulse && (
        <>
          <circle cx={pulse.x} cy={pulse.y} r={17} fill={color.brand200} opacity={0.22} />
          <circle cx={pulse.x} cy={pulse.y} r={7.5} fill={color.brand50} />
        </>
      )}
      {edge.label && (
        <g opacity={fadeIn(progress, 0.55, 0.35) * Math.max(0, (opacity - DIM) / (1 - DIM))}>
          <rect
            x={edge.label.x}
            y={edge.label.y}
            width={edge.label.w}
            height={edge.label.h}
            rx={10}
            fill={color.brand950}
            stroke={color.brand700}
            strokeWidth={1.5}
          />
          {edge.label.lines.map((line, i) => (
            <text
              key={i}
              x={edge.label!.x + edge.label!.w / 2}
              y={edge.label!.y + 6 + EDGE_FONT * 1.05 + i * EDGE_FONT * 1.3}
              textAnchor="middle"
              fill={color.brand100}
              fontFamily={fontStack.sans}
              fontSize={EDGE_FONT}
              fontWeight={500}
            >
              {line}
            </text>
          ))}
        </g>
      )}
    </g>
  );
};
