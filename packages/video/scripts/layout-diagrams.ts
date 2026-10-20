/**
 * Lays out handbook Mermaid diagrams with ELK and writes fixed positions to
 * `src/generated/<name>.layout.json`. Layout runs here, once, so rendering a video never depends on
 * an async layout engine and a re-render of unchanged content is byte-identical.
 *
 *   node --experimental-strip-types scripts/layout-diagrams.ts [path/to/diagram.mmd ...]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ELK from "elkjs/lib/elk.bundled.js";
import { parseFlowchart, type Direction } from "./mermaid-flowchart.ts";
import type { DiagramLayout, LaidOutEdge, LaidOutNode, Point } from "../src/diagram/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const modules = resolve(here, "../../../apps/handbook/src/content/docs/learn/modules");
const out = resolve(here, "../src/generated");

const DEFAULTS = ["06-mcp.host-client-server", "06-mcp.stateless-routing"];

/**
 * The page diagrams are drawn for a column of text. A 16:9 frame wants a different shape for some,
 * so a diagram can override the root direction and how ELK treats its subgraphs.
 */
const OVERRIDES: Record<string, { direction?: Direction; separateGroups?: boolean }> = {
  // Two stacked panels become a side-by-side before/after, each panel still reading top-down.
  "06-mcp.stateless-routing": { direction: "LR", separateGroups: true },
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

async function layout(name: string): Promise<DiagramLayout> {
  const source = readFileSync(resolve(modules, `${name}.mmd`), "utf8");
  const chart = parseFlowchart(source);
  const override = OVERRIDES[name] ?? {};
  const rootDirection = override.direction ?? chart.direction;
  const elk = new ELK();

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
      },
    });
  }
  for (const node of chart.nodes) {
    const size = textSize(node.label, NODE_FONT);
    elkNodes.set(node.id, {
      id: node.id,
      width: Math.max(size.w + NODE_PAD_X * 2, 200),
      height: size.h + NODE_PAD_Y * 2,
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
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "70",
      "elk.layered.spacing.nodeNodeBetweenLayers": "150",
      "elk.spacing.edgeNode": "40",
      "elk.spacing.edgeLabel": "12",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "44",
      "elk.padding": "[top=40,left=40,bottom=40,right=40]",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
  };
  for (const group of chart.groups) {
    const node = elkNodes.get(group.id)!;
    (group.parent ? elkNodes.get(group.parent)! : root).children!.push(node);
  }
  for (const node of chart.nodes) {
    const elkNode = elkNodes.get(node.id)!;
    (node.parent ? elkNodes.get(node.parent)! : root).children!.push(elkNode);
  }
  for (const edge of chart.edges) {
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
      nodes.push({
        id: child.id,
        kind: group ? "group" : "node",
        label: group ? wrap(group.title, GROUP_TITLE_CHARS) : (leaf?.label ?? [child.id]),
        parent,
        x,
        y,
        w: child.width ?? 0,
        h: child.height ?? 0,
      });
      walk(child, child.id, x, y);
    }
  };
  walk(laid, null, 0, 0);

  const edges: LaidOutEdge[] = (laid.edges ?? []).map((edge) => {
    const parsed = chart.edges.find((e) => e.id === edge.id)!;
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
    };
  });

  return {
    name,
    width: Math.ceil(laid.width ?? 0),
    height: Math.ceil(laid.height ?? 0),
    nodes: nodes.map((n) => ({ ...n, x: Math.round(n.x), y: Math.round(n.y) })),
    edges,
  };
}

const names = process.argv.slice(2).map((p) => basename(p, ".mmd"));
mkdirSync(out, { recursive: true });
for (const name of names.length > 0 ? names : DEFAULTS) {
  const result = await layout(name);
  writeFileSync(resolve(out, `${name}.layout.json`), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `${name}: ${result.nodes.length} nodes, ${result.edges.length} edges, ${result.width}x${result.height}\n`,
  );
}
