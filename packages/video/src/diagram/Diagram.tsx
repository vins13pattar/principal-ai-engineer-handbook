import React, { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { getLength, getPointAtLength } from "@remotion/paths";
import { cameraProgress, enterProgress, fadeIn, STAGGER } from "../motion.ts";
import { color, fontStack, size } from "../theme.ts";
import { wrapText } from "../scenes/text.ts";
import type {
  DiagramLayout,
  DiagramStep,
  LaidOutEdge,
  LaidOutNode,
  LegendItem,
  NodeShape,
  Point,
} from "./types.ts";

const NODE_FONT = 30;
const EDGE_FONT = 24;
const GROUP_FONT = 30;
/** How bright a shown-but-not-focused element stays, so the viewer keeps the whole picture. */
const DIM = 0.38;
/** How visible an element is before the narration reaches it: the chart is never empty. */
const GHOST = 0.55;
/** How visible a not-yet-lit label is: enough to read the shape of the chart, not enough to compete. */
const GHOST_TEXT = 0.34;
const ARROW = 17;
/** The whole chart is shown for this long before the first step, so frame zero is never empty. */
const ORIENT_SECONDS = 1.6;
/** Bottom of the camera area; the legend lives below it. */
const AREA_BOTTOM = 922;

interface Props {
  layout: DiagramLayout;
  steps: DiagramStep[];
  /** Edge ids drawn as a route that cannot be taken. */
  blocked?: string[];
  legend?: LegendItem[];
  durationInFrames: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function roundedPath(points: Point[], radius = 20): string {
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

/** A node's box including the note that hangs under it. */
function nodeBox(node: LaidOutNode): Rect {
  return node.note ? { ...node, h: node.h + 24 + noteHeight(node) } : node;
}

function noteHeight(node: LaidOutNode): number {
  return node.note ? wrapText(node.note.lines.join(" "), 34).length * 30 : 0;
}

interface ResolvedStep extends DiagramStep {
  /** Everything this step newly reveals, groups first, then nodes, then edges. */
  show: string[];
  focus: string[];
  frame: Rect;
}

/**
 * Turns authored steps into what each one reveals and frames. Showing a node also shows the groups
 * that contain it, and an edge appears as soon as both its ends are on the chart, so a script
 * names only the places it wants lit. A step with no `focus` frames what it newly revealed.
 */
function resolveSteps(layout: DiagramLayout, steps: DiagramStep[]) {
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(layout.edges.map((e) => [e.id, e]));
  const boxOf = (id: string): Rect => {
    const node = nodeById.get(id);
    if (node) return nodeBox(node);
    const edge = edgeById.get(id);
    if (edge) return edgeBox(edge);
    throw new Error(`Diagram ${layout.name}: unknown element "${id}"`);
  };
  const whole = boundsOf([...layout.nodes.map(nodeBox), ...layout.edges.map(edgeBox)]);
  const shown = new Set<string>();

  const resolved: ResolvedStep[] = steps.map((step) => {
    const added: string[] = [];
    const add = (id: string) => {
      if (shown.has(id)) return;
      boxOf(id);
      shown.add(id);
      added.push(id);
    };
    const withAncestors = (id: string) => {
      const node = nodeById.get(id);
      if (node?.parent) withAncestors(node.parent);
      add(id);
    };
    for (const id of step.show) withAncestors(id);
    for (const edge of layout.edges) {
      if (!shown.has(edge.id) && shown.has(edge.from) && shown.has(edge.to)) add(edge.id);
    }
    for (const id of [...(step.focus ?? []), ...(step.camera ?? [])]) boxOf(id);

    const isGroup = (id: string) => nodeById.get(id)?.kind === "group";
    const ordered = [
      ...added.filter(isGroup),
      ...added.filter((id) => nodeById.has(id) && !isGroup(id)),
      ...added.filter((id) => edgeById.has(id)),
    ];
    const leaves = ordered.filter((id) => !isGroup(id));
    const focus = step.focus ?? (leaves.length > 0 ? leaves : ordered);
    // Long routes would stretch the frame; the camera follows the places a step lights, and edges only when it lights none.
    const lit = focus.filter((id) => nodeById.has(id));
    const camera = step.camera ?? (lit.length > 0 ? lit : focus);
    return { ...step, show: ordered, focus, frame: boundsOf(camera.map(boxOf)) };
  });
  return { resolved, whole };
}

function fitCamera(rect: Rect, area: Rect, maxScale: number) {
  const pad = 80;
  const scale = Math.min(area.w / (rect.w + pad * 2), area.h / (rect.h + pad * 2), maxScale);
  return { scale, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 };
}

/** The key, when a script does not write one: the symbols this chart actually uses. */
function defaultLegend(layout: DiagramLayout, blocked: string[]): LegendItem[] {
  const shapes = new Set(layout.nodes.filter((n) => n.kind === "node").map((n) => n.shape));
  const items: LegendItem[] = [{ kind: "place", label: "step" }];
  if (shapes.has("decision")) items.push({ kind: "decision", label: "decision" });
  if (shapes.has("store")) items.push({ kind: "store", label: "store" });
  if (shapes.has("terminal")) items.push({ kind: "terminal", label: "start or end" });
  items.push({ kind: "route", label: "flow" });
  if (blocked.length > 0) items.push({ kind: "blocked", label: "cannot happen" });
  if (layout.nodes.some((n) => n.kind === "group"))
    items.push({ kind: "region", label: "boundary" });
  return items.slice(0, 5);
}

export const Diagram: React.FC<Props> = ({
  layout,
  steps,
  blocked = [],
  legend,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { resolved, whole } = useMemo(() => resolveSteps(layout, steps), [layout, steps]);
  const orient = Math.round(ORIENT_SECONDS * fps);
  const startFrames = resolved.map((s, i) =>
    Math.max(Math.round(s.at * durationInFrames), i === 0 ? orient : 0),
  );

  const area: Rect = { x: 0, y: size.top, w: size.width, h: AREA_BOTTOM - size.top };

  // Camera: the whole chart first, then each step's framing, easing between them.
  let active = -1;
  for (let i = 0; i < resolved.length; i++) if (frame >= startFrames[i]!) active = i;
  const wholeCamera = fitCamera(whole, area, 1.35);
  const cams = resolved.map((s) => fitCamera(s.frame, area, 0.85));
  // A chart too big to read whole opens close on its first step instead, ghosts spreading beyond it.
  const overview =
    wholeCamera.scale >= 0.45 || cams.length === 0
      ? wholeCamera
      : { ...cams[0]!, scale: Math.min(cams[0]!.scale, 0.8) };
  const cam = (() => {
    if (active < 0) return overview;
    const to = cams[active]!;
    const from = active === 0 ? overview : cams[active - 1]!;
    const p = cameraProgress(frame, startFrames[active]!, fps);
    return {
      scale: from.scale + (to.scale - from.scale) * p,
      cx: from.cx + (to.cx - from.cx) * p,
      cy: from.cy + (to.cy - from.cy) * p,
    };
  })();

  // The step that first shows an element decides when it enters.
  const entry = new Map<string, { step: number; index: number }>();
  resolved.forEach((s, step) =>
    s.show.forEach((id, index) => {
      if (!entry.has(id)) entry.set(id, { step, index });
    }),
  );

  const progress = (id: string): number => {
    const e = entry.get(id);
    if (!e) return 0;
    return enterProgress(frame, startFrames[e.step]! + Math.min(e.index, 8) * STAGGER, fps);
  };
  // Brightness once shown: focused in the active step => 1, otherwise dimmed.
  const brightness = (id: string): number => {
    const e = entry.get(id);
    if (!e || active < e.step) return 0;
    const target = (step: number) => (resolved[step]!.focus.includes(id) ? 1 : DIM);
    if (active === 0) return target(0);
    const p = cameraProgress(frame, startFrames[active]!, fps);
    const before = active - 1 < e.step ? 1 : target(active - 1);
    return before + (target(active) - before) * p;
  };
  const focused = (id: string) => active >= 0 && resolved[active]!.focus.includes(id);

  const tx = size.width / 2 - cam.cx * cam.scale;
  const ty = area.y + area.h / 2 - cam.cy * cam.scale;
  const groups = layout.nodes.filter((n) => n.kind === "group");
  const leaves = layout.nodes.filter((n) => n.kind === "node");
  const key = legend ?? defaultLegend(layout, blocked);

  return (
    <>
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <clipPath id="diagram-area">
            <rect x={0} y={area.y} width={area.w} height={area.h} />
          </clipPath>
        </defs>
        <g clipPath="url(#diagram-area)">
          <g transform={`translate(${tx} ${ty}) scale(${cam.scale})`}>
            {groups.map((g) => (
              <Region key={g.id} node={g} brightness={brightness(g.id)} progress={progress(g.id)} />
            ))}
            {layout.edges.map((e) => (
              <Route
                key={e.id}
                edge={e}
                blocked={blocked.includes(e.id)}
                brightness={brightness(e.id)}
                progress={progress(e.id)}
                active={focused(e.id)}
                frame={frame}
                fps={fps}
              />
            ))}
            {leaves.map((n) => (
              <Place
                key={n.id}
                node={n}
                brightness={brightness(n.id)}
                progress={progress(n.id)}
                active={focused(n.id)}
                frame={frame}
                fps={fps}
              />
            ))}
          </g>
        </g>
      </svg>
      <Legend items={key} />
    </>
  );
};

const Region: React.FC<{ node: LaidOutNode; brightness: number; progress: number }> = ({
  node,
  brightness,
  progress,
}) => {
  const lit = Math.min(progress * 1.3, 1);
  const title = (opacity: number) =>
    node.label.map((line, i) => (
      <text
        key={i}
        x={node.x + 32}
        y={node.y + 52 + i * GROUP_FONT * 1.25}
        fill={color.brand200}
        opacity={opacity}
        fontFamily={fontStack.display}
        fontStyle="italic"
        fontWeight={600}
        fontSize={GROUP_FONT}
      >
        {line}
      </text>
    ));
  return (
    <g>
      <g opacity={1 - lit}>
        <rect
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          rx={26}
          fill="none"
          stroke={color.brand600}
          strokeWidth={1.6}
          strokeDasharray="3 9"
          opacity={GHOST}
        />
        {title(GHOST_TEXT)}
      </g>
      <g opacity={brightness * lit}>
        <rect
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          rx={26}
          fill="rgba(79,70,229,0.10)"
          stroke={color.brand400}
          strokeOpacity={0.75}
          strokeWidth={1.6}
        />
        {title(1)}
      </g>
    </g>
  );
};

/** The outline of a place, by shape: chamfered for a decision, a pill for a terminal, and so on. */
function outline(node: LaidOutNode, props: React.SVGProps<SVGElement>): React.ReactNode {
  const { x, y, w, h } = node;
  const shape: NodeShape = node.shape;
  const common = props as React.SVGProps<SVGPathElement>;
  switch (shape) {
    case "decision": {
      const c = Math.min(h * 0.34, 34);
      return (
        <path
          d={`M ${x + c} ${y} L ${x + w - c} ${y} L ${x + w} ${y + c} L ${x + w} ${y + h - c} L ${x + w - c} ${y + h} L ${x + c} ${y + h} L ${x} ${y + h - c} L ${x} ${y + c} Z`}
          strokeLinejoin="round"
          {...common}
        />
      );
    }
    case "terminal":
      return (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={h / 2}
          {...(props as React.SVGProps<SVGRectElement>)}
        />
      );
    case "circle":
      return (
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          {...(props as React.SVGProps<SVGEllipseElement>)}
        />
      );
    case "store":
      return (
        <path
          d={`M ${x} ${y + 16} Q ${x} ${y} ${x + w / 2} ${y} Q ${x + w} ${y} ${x + w} ${y + 16} L ${x + w} ${y + h - 16} Q ${x + w} ${y + h} ${x + w / 2} ${y + h} Q ${x} ${y + h} ${x} ${y + h - 16} Z M ${x} ${y + 16} Q ${x} ${y + 32} ${x + w / 2} ${y + 32} Q ${x + w} ${y + 32} ${x + w} ${y + 16}`}
          {...common}
        />
      );
    default:
      return (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={12}
          {...(props as React.SVGProps<SVGRectElement>)}
        />
      );
  }
}

const Place: React.FC<{
  node: LaidOutNode;
  brightness: number;
  progress: number;
  active: boolean;
  frame: number;
  fps: number;
}> = ({ node, brightness, progress, active, frame, fps }) => {
  const lift = interpolate(progress, [0, 1], [10, 0]);
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2 + (node.shape === "store" ? 8 : 0);
  const lit = Math.min(progress * 1.5, 1);
  const pulse = active ? (frame % (fps * 2)) / (fps * 2) : 0;
  const note = node.note ? wrapText(node.note.lines.join(" "), 34) : [];
  const labelY = (i: number) =>
    cy + (i - (node.label.length - 1) / 2) * NODE_FONT * 1.28 + NODE_FONT * 0.34;
  return (
    <g>
      <g opacity={1 - lit}>
        {outline(node, {
          fill: "none",
          stroke: color.brand600,
          strokeWidth: 1.6,
          opacity: GHOST,
        } as React.SVGProps<SVGElement>)}
        {node.label.map((line, i) => (
          <text
            key={i}
            x={cx + 4}
            y={labelY(i)}
            textAnchor="middle"
            fill={color.inkSoft}
            opacity={GHOST_TEXT}
            fontFamily={fontStack.sans}
            fontSize={NODE_FONT}
            fontWeight={i === 0 ? 650 : 450}
          >
            {line}
          </text>
        ))}
      </g>
      <g opacity={brightness * lit} transform={`translate(0 ${lift})`}>
        {active &&
          outline(
            {
              ...node,
              x: node.x - pulse * 14,
              y: node.y - pulse * 14,
              w: node.w + pulse * 28,
              h: node.h + pulse * 28,
            },
            {
              fill: "none",
              stroke: color.route,
              strokeWidth: 2,
              opacity: (1 - pulse) * 0.7,
            } as React.SVGProps<SVGElement>,
          )}
        {outline(node, {
          fill: color.place,
          stroke: active
            ? color.route
            : node.shape === "decision"
              ? color.brand200
              : color.brand300,
          strokeWidth: active ? 3 : 1.8,
        } as React.SVGProps<SVGElement>)}
        <circle
          cx={node.x}
          cy={node.y + node.h / 2}
          r={8}
          fill={active ? color.route : color.sea}
          stroke={active ? color.route : color.brand300}
          strokeWidth={2.5}
        />
        {node.label.map((line, i) => (
          <text
            key={i}
            x={cx + 4}
            y={labelY(i)}
            textAnchor="middle"
            fill={i === 0 ? color.ink : color.inkSoft}
            fontFamily={fontStack.sans}
            fontSize={NODE_FONT}
            fontWeight={i === 0 ? 650 : 450}
          >
            {line}
          </text>
        ))}
        {note.length > 0 && (
          <g opacity={active ? 1 : 0.55}>
            <line
              x1={cx}
              y1={node.y + node.h}
              x2={cx}
              y2={node.y + node.h + 16}
              stroke={node.note?.dashed ? color.fault : color.route}
              strokeWidth={2}
            />
            {note.map((line, i) => (
              <text
                key={i}
                x={cx}
                y={node.y + node.h + 46 + i * 30}
                textAnchor="middle"
                fill={node.note?.dashed ? color.fault : color.route}
                fontFamily={fontStack.display}
                fontStyle="italic"
                fontWeight={600}
                fontSize={24}
              >
                {line}
              </text>
            ))}
          </g>
        )}
      </g>
    </g>
  );
};

const Route: React.FC<{
  edge: LaidOutEdge;
  blocked: boolean;
  brightness: number;
  progress: number;
  active: boolean;
  frame: number;
  fps: number;
}> = ({ edge, blocked, brightness, progress, active, frame, fps }) => {
  const d = useMemo(() => roundedPath(edge.path), [edge]);
  const length = useMemo(() => getLength(d), [d]);
  const maskId = `reveal-${edge.id}`;
  const draw = Math.min(progress, 1);
  const first = edge.path[0]!;
  const last = edge.path.at(-1)!;
  const stroke = blocked ? color.fault : active ? color.route : color.brand300;
  const loop = fps * 2.4;
  const pulse =
    active && !blocked && draw > 0.95 && edge.arrow
      ? getPointAtLength(d, ((frame % loop) / loop) * length)
      : null;
  const beforeLast = edge.path.at(-2) ?? first;
  const dashed = blocked || edge.dashed;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color.brand500}
        strokeWidth={2}
        strokeDasharray="3 9"
        opacity={GHOST * (1 - draw)}
      />
      <g opacity={brightness}>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-50} y={-50} width={6000} height={6000}>
          <path
            d={d}
            stroke="white"
            strokeWidth={18}
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
            strokeWidth={active ? 4.5 : 3}
            strokeLinecap="round"
            strokeDasharray={dashed ? "11 10" : undefined}
          />
        </g>
        {draw > 0.9 && edge.arrow && (
          <g opacity={fadeIn(draw, 0.9, 0.1)}>
            {blocked ? <Cross at={last} /> : <path d={arrowHead(last, beforeLast)} fill={stroke} />}
            {edge.bidirectional && !blocked && (
              <path d={arrowHead(first, edge.path[1] ?? last)} fill={stroke} />
            )}
          </g>
        )}
        {pulse && (
          <>
            <circle cx={pulse.x} cy={pulse.y} r={16} fill={color.route} opacity={0.2} />
            <circle cx={pulse.x} cy={pulse.y} r={7} fill={color.brand50} />
          </>
        )}
        {edge.label && (
          <g opacity={fadeIn(progress, 0.55, 0.35) * Math.max(0, (brightness - DIM) / (1 - DIM))}>
            <rect
              x={edge.label.x}
              y={edge.label.y}
              width={edge.label.w}
              height={edge.label.h}
              rx={9}
              fill={color.sea}
              stroke={blocked ? color.fault : active ? color.route : color.brand600}
              strokeWidth={1.5}
            />
            {edge.label.lines.map((line, i) => (
              <text
                key={i}
                x={edge.label!.x + edge.label!.w / 2}
                y={edge.label!.y + 6 + EDGE_FONT * 1.02 + i * EDGE_FONT * 1.3}
                textAnchor="middle"
                fill={blocked ? color.fault : active ? color.route : color.inkSoft}
                fontFamily={fontStack.sans}
                fontSize={EDGE_FONT}
                fontWeight={550}
              >
                {line}
              </text>
            ))}
          </g>
        )}
      </g>
    </g>
  );
};

/** A route that cannot be taken ends in a cross, not an arrowhead. */
const Cross: React.FC<{ at: Point }> = ({ at }) => (
  <g stroke={color.fault} strokeWidth={5} strokeLinecap="round">
    <line x1={at.x - 11} y1={at.y - 11} x2={at.x + 11} y2={at.y + 11} />
    <line x1={at.x - 11} y1={at.y + 11} x2={at.x + 11} y2={at.y - 11} />
  </g>
);

/** The chart's key: names the symbols this plate uses. Present from the first frame. */
const Legend: React.FC<{ items: LegendItem[] }> = ({ items }) => (
  <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
    <g
      transform={`translate(${size.margin} 950)`}
      fontFamily={fontStack.sans}
      fontSize={24}
      fontWeight={500}
    >
      {items.map((item, i) => (
        <g key={item.label} transform={`translate(${i * 330} 0)`}>
          {item.kind === "place" && (
            <>
              <rect
                x={0}
                y={-15}
                width={44}
                height={30}
                rx={7}
                fill={color.place}
                stroke={color.brand300}
                strokeWidth={1.6}
              />
              <circle
                cx={0}
                cy={0}
                r={5.5}
                fill={color.sea}
                stroke={color.brand300}
                strokeWidth={2}
              />
            </>
          )}
          {item.kind === "decision" && (
            <path
              d="M 10 -15 L 34 -15 L 44 -5 L 44 5 L 34 15 L 10 15 L 0 5 L 0 -5 Z"
              fill={color.place}
              stroke={color.brand200}
              strokeWidth={1.8}
            />
          )}
          {item.kind === "terminal" && (
            <rect
              x={0}
              y={-15}
              width={44}
              height={30}
              rx={15}
              fill={color.place}
              stroke={color.brand300}
              strokeWidth={1.6}
            />
          )}
          {item.kind === "store" && (
            <path
              d="M 0 -8 Q 0 -15 22 -15 Q 44 -15 44 -8 L 44 8 Q 44 15 22 15 Q 0 15 0 8 Z M 0 -8 Q 0 -1 22 -1 Q 44 -1 44 -8"
              fill={color.place}
              stroke={color.brand300}
              strokeWidth={1.6}
            />
          )}
          {item.kind === "route" && (
            <path
              d="M 0 0 L 44 0 M 44 0 L 33 -7 L 33 7 Z"
              stroke={color.route}
              strokeWidth={3.5}
              fill={color.route}
            />
          )}
          {item.kind === "blocked" && (
            <>
              <path d="M 0 0 L 32 0" stroke={color.fault} strokeWidth={3.5} strokeDasharray="8 7" />
              <g stroke={color.fault} strokeWidth={4} strokeLinecap="round">
                <line x1={34} y1={-7} x2={46} y2={7} />
                <line x1={34} y1={7} x2={46} y2={-7} />
              </g>
            </>
          )}
          {item.kind === "region" && (
            <rect
              x={0}
              y={-15}
              width={44}
              height={30}
              rx={10}
              fill="rgba(79,70,229,0.18)"
              stroke={color.brand400}
              strokeWidth={1.6}
            />
          )}
          <text x={58} y={8} fill={color.inkSoft}>
            {item.label}
          </text>
        </g>
      ))}
    </g>
  </svg>
);
