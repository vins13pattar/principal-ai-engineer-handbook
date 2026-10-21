/**
 * Lays out handbook Mermaid diagrams with ELK and writes fixed positions to
 * `src/generated/<name>.layout.json`, plus `src/generated/layouts.ts` indexing them all. Layout runs
 * here, once, so rendering a video never depends on an async layout engine and a re-render of
 * unchanged content is byte-identical.
 *
 *   node --experimental-strip-types scripts/layout-diagrams.ts [path/to/diagram.mmd ...]
 *
 * With no arguments it lays out every flowchart in the Learn modules. Sequence diagrams are drawn by
 * their own scene and are skipped.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ELK from "elkjs/lib/elk.bundled.js";
import { parseFlowchart, type Direction, type Shape } from "./mermaid-flowchart.ts";
import { parseSequence } from "./mermaid-sequence.ts";
import type { DiagramLayout, LaidOutEdge, LaidOutNode, Point } from "../src/diagram/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const modules = resolve(here, "../../../apps/handbook/src/content/docs/learn/modules");
const out = resolve(here, "../src/generated");

/**
 * The page diagrams are drawn for a column of text. A 16:9 frame wants a different shape for some,
 * so a diagram can override the root direction and how ELK treats its subgraphs.
 */
export interface Override {
  direction?: Direction;
  separateGroups?: boolean;
  routing?: "ORTHOGONAL" | "POLYLINE";
}

const OVERRIDES: Record<string, Override> = {
  // Two stacked panels become a side-by-side before/after, each panel still reading top-down.
  // Straight fan-out lines keep three replicas from sharing one bend corridor.
  "06-mcp.stateless-routing": { direction: "LR", separateGroups: true, routing: "POLYLINE" },
  // A tall top-down chain read by a panning camera beats a folded one whose feedback edges loop across the frame.
  "00-principal-engineer-mindset.decision-flow": { direction: "TB" },
};

// Text metrics for the rendered diagram. They only size boxes; the renderer draws text itself.
const NODE_FONT = 30;
const EDGE_FONT = 24;
const GROUP_FONT = 26;
const GROUP_TITLE_CHARS = 26;
const CHAR = 0.56;
const NODE_PAD_X = 34;
const NODE_PAD_Y = 24;

const ELK_DIRECTION: Record<Direction, string> = { LR: "RIGHT", TB: "DOWN", RL: "LEFT", BT: "UP" };

/** Wraps a one-line label at word boundaries so a long group title does not stretch its panel. */
function wrap(lines: string[], max: number): string[] {
  return lines.flatMap((line) => {
    const out: string[] = [];
    let current = "";
    for (const word of line.split(" ")) {
      if (current && (current + " " + word).length > max) {
        out.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) out.push(current);
    return out;
  });
}

function textSize(lines: string[], font: number) {
  const longest = Math.max(...lines.map((line) => line.length));
  return { w: Math.ceil(longest * font * CHAR), h: Math.ceil(lines.length * font * 1.3) };
}

/** Box size for a node: its text, plus room for its shape's geometry. */
function nodeSize(lines: string[], shape: Shape) {
  const t = textSize(lines, NODE_FONT);
  switch (shape) {
    case "decision":
      return { w: Math.max(t.w + 120, 260), h: t.h + NODE_PAD_Y * 2 + 36 };
    case "terminal":
      return { w: Math.max(t.w + 100, 220), h: t.h + NODE_PAD_Y * 2 };
    case "store":
      return { w: Math.max(t.w + NODE_PAD_X * 2, 240), h: t.h + NODE_PAD_Y * 2 + 22 };
    case "circle":
      return { w: Math.max(t.w + 90, 200), h: Math.max(t.h + 70, 120) };
    default:
      return { w: Math.max(t.w + NODE_PAD_X * 2, 200), h: t.h + NODE_PAD_Y * 2 };
  }
}

interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string>;
  labels?: { text: string; width: number; height: number }[];
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  container?: string;
  labels?: {
    text: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
    layoutOptions?: Record<string, string>;
  }[];
  sections?: { startPoint: Point; endPoint: Point; bendPoints?: Point[] }[];
}

async function layout(name: string, forced?: Direction, fold = false): Promise<DiagramLayout> {
  const source = readFileSync(resolve(modules, `${name}.mmd`), "utf8");
  const chart = parseFlowchart(source);
  const override = OVERRIDES[name] ?? {};
  const rootDirection = override.direction ?? forced ?? chart.direction;
  const elk = new ELK();

  // A self-referencing edge cannot be routed; it becomes a note on its node.
  const notes = new Map<string, { lines: string[]; dashed: boolean }>();
  const edges = chart.edges.filter((edge) => {
    if (edge.from !== edge.to) return true;
    if (edge.label.length > 0) notes.set(edge.from, { lines: edge.label, dashed: edge.dashed });
    return false;
  });

  const elkNodes = new Map<string, ElkNode>();
  for (const group of chart.groups) {
    const title = textSize(wrap(group.title, GROUP_TITLE_CHARS), GROUP_FONT);
    elkNodes.set(group.id, {
      id: group.id,
      children: [],
      labels: [{ text: group.title.join(" "), width: title.w, height: title.h }],
      layoutOptions: {
        "elk.padding": "[top=84,left=44,bottom=44,right=44]",
        "elk.direction": ELK_DIRECTION[group.direction ?? chart.direction],
        "elk.nodeLabels.placement": "[H_LEFT, V_TOP, INSIDE]",
        "elk.edgeRouting": override.routing ?? "ORTHOGONAL",
      },
    });
  }
  for (const node of chart.nodes) {
    const size = nodeSize(node.label, node.shape);
    const note = notes.get(node.id);
    const noteSize = note ? textSize(wrap(note.lines, 34), 24) : null;
    elkNodes.set(node.id, {
      id: node.id,
      width: size.w,
      // Leave room under the node for its note, so the router does not cross it.
      height: size.h + (noteSize ? noteSize.h + 24 : 0),
    });
  }

  const root: ElkNode = {
    id: "root",
    children: [],
    edges: [],
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": ELK_DIRECTION[rootDirection],
      "elk.hierarchyHandling": override.separateGroups ? "SEPARATE_CHILDREN" : "INCLUDE_CHILDREN",
      "elk.edgeRouting": override.routing ?? "ORTHOGONAL",
      "elk.spacing.nodeNode": "70",
      "elk.layered.spacing.nodeNodeBetweenLayers": "170",
      "elk.spacing.edgeNode": "40",
      "elk.spacing.edgeLabel": "12",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "64",
      "elk.padding": "[top=40,left=40,bottom=40,right=40]",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      // A long chain is folded into rows so the whole chart can fill a 16:9 frame.
      ...(fold
        ? {
            "elk.layered.wrapping.strategy": "MULTI_EDGE",
            "elk.aspectRatio": "2.2",
            "elk.layered.wrapping.correctionFactor": "1.2",
          }
        : {}),
    },
  };
  // Parents before children, so a nested group lands inside the one that holds it.
  const depth = (id: string | null): number => {
    const group = chart.groups.find((g) => g.id === id);
    return group ? 1 + depth(group.parent) : 0;
  };
  for (const group of [...chart.groups].sort((a, b) => depth(a.parent) - depth(b.parent))) {
    (group.parent ? elkNodes.get(group.parent)! : root).children!.push(elkNodes.get(group.id)!);
  }
  for (const node of chart.nodes) {
    (node.parent ? elkNodes.get(node.parent)! : root).children!.push(elkNodes.get(node.id)!);
  }
  for (const edge of edges) {
    const label = edge.label.length > 0 ? textSize(edge.label, EDGE_FONT) : null;
    root.edges!.push({
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
      ...(label
        ? {
            labels: [
              {
                text: edge.label.join(" "),
                width: label.w + 20,
                height: label.h + 12,
                layoutOptions: { "elk.edgeLabels.inline": "true" },
              },
            ],
          }
        : {}),
    });
  }

  const laid = (await elk.layout(root as never)) as unknown as ElkNode;

  // ELK reports child positions relative to their parent; flatten to absolute.
  const absolute = new Map<string, { x: number; y: number }>([["root", { x: 0, y: 0 }]]);
  const nodes: LaidOutNode[] = [];
  const walk = (node: ElkNode, parent: string | null, ox: number, oy: number) => {
    for (const child of node.children ?? []) {
      const x = ox + (child.x ?? 0);
      const y = oy + (child.y ?? 0);
      absolute.set(child.id, { x, y });
      const group = chart.groups.find((g) => g.id === child.id);
      const leaf = chart.nodes.find((n) => n.id === child.id);
      const note = notes.get(child.id);
      const size = leaf ? nodeSize(leaf.label, leaf.shape) : null;
      nodes.push({
        id: child.id,
        kind: group ? "group" : "node",
        label: group ? wrap(group.title, GROUP_TITLE_CHARS) : (leaf?.label ?? [child.id]),
        parent,
        shape: leaf?.shape ?? "box",
        x,
        y,
        w: child.width ?? 0,
        // The note hangs below the box, so the box itself is the node's own height.
        h: size ? size.h : (child.height ?? 0),
        ...(note ? { note } : {}),
      });
      walk(child, child.id, x, y);
    }
  };
  walk(laid, null, 0, 0);

  const laidEdges: LaidOutEdge[] = (laid.edges ?? []).map((edge) => {
    const parsed = edges.find((e) => e.id === edge.id)!;
    const origin = absolute.get(edge.container ?? "root") ?? { x: 0, y: 0 };
    const section = edge.sections?.[0];
    if (!section) throw new Error(`ELK returned no route for ${edge.id}`);
    const path = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({
      x: Math.round(origin.x + p.x),
      y: Math.round(origin.y + p.y),
    }));
    const label = edge.labels?.[0];
    return {
      id: edge.id,
      from: parsed.from,
      to: parsed.to,
      path,
      label: label
        ? {
            lines: parsed.label,
            x: Math.round(origin.x + (label.x ?? 0)),
            y: Math.round(origin.y + (label.y ?? 0)),
            w: label.width,
            h: label.height,
          }
        : null,
      dashed: parsed.dashed,
      bidirectional: parsed.bidirectional,
      arrow: parsed.arrow,
    };
  });

  return {
    name,
    width: Math.ceil(laid.width ?? 0),
    height: Math.ceil(laid.height ?? 0),
    nodes: nodes.map((n) => ({ ...n, x: Math.round(n.x), y: Math.round(n.y) })),
    edges: laidEdges,
  };
}

function flowcharts(): string[] {
  return readdirSync(modules)
    .filter((file) => file.endsWith(".mmd"))
    .filter(
      (file) =>
        !readFileSync(resolve(modules, file), "utf8").trimStart().startsWith("sequenceDiagram"),
    )
    .map((file) => basename(file, ".mmd"))
    .sort();
}

const requested = process.argv.slice(2).map((p) => basename(p, ".mmd"));
const names = requested.length > 0 ? requested : flowcharts();
mkdirSync(out, { recursive: true });
/** How large the whole chart can be drawn in the video's content area, as a scale factor. */
const fit = (l: DiagramLayout) => Math.min(1920 / (l.width + 160), 726 / (l.height + 160));

/** Average route length over the straight distance between its ends: near 1 is direct, high is a loop. */
function routeDirectness(l: DiagramLayout): number {
  const ratios = l.edges.map((e) => {
    let length = 0;
    for (let i = 1; i < e.path.length; i++) {
      length += Math.hypot(e.path[i]!.x - e.path[i - 1]!.x, e.path[i]!.y - e.path[i - 1]!.y);
    }
    const a = e.path[0]!;
    const b = e.path.at(-1)!;
    return length / Math.max(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 60);
  });
  return ratios.reduce((sum, r) => sum + r, 0) / Math.max(ratios.length, 1);
}

/** A folded layout is optional: ELK cannot always route every edge once a chain is wrapped. */
async function tryFolded(
  name: string,
  direction: Direction,
): Promise<{ layout: DiagramLayout; folded: true }[]> {
  try {
    return [{ layout: await layout(name, direction, true), folded: true }];
  } catch {
    return [];
  }
}

for (const name of names) {
  // Flow charts are drawn for a column of text. Try both directions and keep the one that fills 16:9.
  const fixed = OVERRIDES[name]?.direction;
  const candidates = fixed
    ? [{ layout: await layout(name), folded: false }]
    : [
        { layout: await layout(name, "TB"), folded: false },
        { layout: await layout(name, "LR"), folded: false },
        ...(await tryFolded(name, "TB")),
        ...(await tryFolded(name, "LR")),
      ];
  const plain = candidates
    .filter((c) => !c.folded)
    .reduce((best, c) => (fit(c.layout) > fit(best.layout) ? c : best));
  // A folded chain fits the frame better but can loop its edges around. Take it only when it is a
  // large gain and its routes stay direct.
  const folded = candidates
    .filter((c) => c.folded && routeDirectness(c.layout) <= 1.4)
    .reduce<(typeof candidates)[number] | null>(
      (best, c) => (best === null || fit(c.layout) > fit(best.layout) ? c : best),
      null,
    );
  const chosen = folded && fit(folded.layout) > fit(plain.layout) * 1.4 ? folded : plain;
  if (process.env["LAYOUT_DEBUG"]) {
    process.stdout.write(
      `  ${candidates.map((c) => `${c.folded ? "fold " : ""}${c.layout.width}x${c.layout.height} fit ${fit(c.layout).toFixed(2)} direct ${routeDirectness(c.layout).toFixed(2)}`).join(" | ")}\n`,
    );
  }
  const result = chosen.layout;
  writeFileSync(resolve(out, `${name}.layout.json`), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `${name.padEnd(52)} ${String(result.nodes.length).padStart(2)} nodes ${String(result.edges.length).padStart(2)} edges ${result.width}x${result.height}\n`,
  );
}

// Sequence diagrams have no layout to compute, only a model to read.
const sequences = readdirSync(modules)
  .filter((file) => file.endsWith(".mmd"))
  .filter((file) =>
    readFileSync(resolve(modules, file), "utf8").trimStart().startsWith("sequenceDiagram"),
  )
  .map((file) => basename(file, ".mmd"));
for (const name of sequences) {
  const model = parseSequence(readFileSync(resolve(modules, `${name}.mmd`), "utf8"));
  writeFileSync(resolve(out, `${name}.sequence.json`), `${JSON.stringify(model, null, 2)}\n`);
  process.stdout.write(
    `${name.padEnd(52)} sequence: ${model.participants.length} participants, ${model.items.length} items\n`,
  );
}

// The index every scene resolves layouts through. Regenerated from what is on disk.
const all = readdirSync(out)
  .filter((file) => file.endsWith(".layout.json"))
  .map((file) => file.replace(".layout.json", ""))
  .sort();
const ident = (name: string) => `l_${name.replace(/[^a-zA-Z0-9]/g, "_")}`;
writeFileSync(
  resolve(out, "layouts.ts"),
  [
    "// Generated by scripts/layout-diagrams.ts. Do not edit.",
    'import type { DiagramLayout } from "../diagram/types.ts";',
    ...all.map((name) => `import ${ident(name)} from "./${name}.layout.json";`),
    "",
    "export const LAYOUTS: Record<string, DiagramLayout> = {",
    ...all.map((name) => `  "${name}": ${ident(name)} as DiagramLayout,`),
    "};",
    "",
  ].join("\n"),
);

const seqs = readdirSync(out)
  .filter((file) => file.endsWith(".sequence.json"))
  .map((file) => file.replace(".sequence.json", ""))
  .sort();
writeFileSync(
  resolve(out, "sequences.ts"),
  [
    "// Generated by scripts/layout-diagrams.ts. Do not edit.",
    'import type { ParsedSequence } from "../../scripts/mermaid-sequence.ts";',
    ...seqs.map((name) => `import ${ident(name)}_seq from "./${name}.sequence.json";`),
    "",
    "export const SEQUENCES: Record<string, ParsedSequence> = {",
    ...seqs.map((name) => `  "${name}": ${ident(name)}_seq as ParsedSequence,`),
    "};",
    "",
  ].join("\n"),
);
