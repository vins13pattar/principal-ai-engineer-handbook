/**
 * Parses the subset of Mermaid flowchart syntax the handbook's diagrams use: `flowchart LR|TB`,
 * `subgraph`/`end` with an optional `direction`, node definitions with `[label]` or `["label"]`,
 * and `-->`, `<-->`, `-.->` edges with an optional `|label|`. Anything outside that subset throws,
 * so a diagram that grows past it fails loudly instead of rendering wrong.
 */

export type Direction = "LR" | "TB" | "RL" | "BT";

export interface ParsedNode {
  id: string;
  label: string[];
  parent: string | null;
}

export interface ParsedGroup {
  id: string;
  title: string[];
  parent: string | null;
  direction: Direction | null;
}

export interface ParsedEdge {
  id: string;
  from: string;
  to: string;
  label: string[];
  dashed: boolean;
  bidirectional: boolean;
}

export interface ParsedFlowchart {
  direction: Direction;
  nodes: ParsedNode[];
  groups: ParsedGroup[];
  edges: ParsedEdge[];
}

const ARROW = String.raw`(<-->|-->|-\.->)`;
const NODE = String.raw`([A-Za-z0-9_]+)(?:\[(.*?)\])?`;
const EDGE_LINE = new RegExp(String.raw`^${NODE}\s*${ARROW}\s*(?:\|(.*?)\|)?\s*${NODE}$`);
const NODE_LINE = new RegExp(String.raw`^${NODE}$`);
const SUBGRAPH_LINE = /^subgraph\s+([A-Za-z0-9_]+)(?:\[(.*)\])?$/;
const DIRECTION_LINE = /^direction\s+(LR|TB|RL|BT)$/;

function toLines(raw: string): string[] {
  const text = raw.trim();
  const unquoted = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  return unquoted
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function parseFlowchart(source: string): ParsedFlowchart {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"));

  const header = lines.shift();
  const headerMatch = header?.match(/^(?:flowchart|graph)\s+(LR|TB|RL|BT)$/);
  if (!headerMatch) throw new Error(`Unsupported flowchart header: ${header ?? "(empty)"}`);

  const result: ParsedFlowchart = {
    direction: headerMatch[1] as Direction,
    nodes: [],
    groups: [],
    edges: [],
  };
  const stack: ParsedGroup[] = [];

  const known = (id: string) =>
    result.nodes.some((node) => node.id === id) || result.groups.some((group) => group.id === id);

  const declare = (id: string, label: string | undefined) => {
    if (label !== undefined) {
      if (known(id)) throw new Error(`Node ${id} is declared twice`);
      result.nodes.push({
        id,
        label: toLines(label),
        parent: stack.at(-1)?.id ?? null,
      });
    } else if (!known(id)) {
      result.nodes.push({ id, label: [id], parent: stack.at(-1)?.id ?? null });
    }
  };

  for (const line of lines) {
    const subgraph = line.match(SUBGRAPH_LINE);
    if (subgraph) {
      const [, id = "", title] = subgraph;
      const group: ParsedGroup = {
        id,
        title: toLines(title ?? id),
        parent: stack.at(-1)?.id ?? null,
        direction: null,
      };
      result.groups.push(group);
      stack.push(group);
      continue;
    }
    if (line === "end") {
      stack.pop();
      continue;
    }
    const direction = line.match(DIRECTION_LINE);
    if (direction) {
      const current = stack.at(-1);
      if (!current) throw new Error("`direction` outside a subgraph");
      current.direction = direction[1] as Direction;
      continue;
    }
    const edge = line.match(EDGE_LINE);
    if (edge) {
      const [, from = "", fromLabel, arrow = "", edgeLabel, to = "", toLabel] = edge;
      declare(from, fromLabel);
      declare(to, toLabel);
      result.edges.push({
        id: `e${result.edges.length + 1}`,
        from,
        to,
        label: edgeLabel === undefined ? [] : toLines(edgeLabel),
        dashed: arrow === "-.->",
        bidirectional: arrow === "<-->",
      });
      continue;
    }
    const node = line.match(NODE_LINE);
    if (node) {
      const [, id = "", label] = node;
      declare(id, label);
      continue;
    }
    throw new Error(`Unsupported flowchart line: ${line}`);
  }

  if (stack.length > 0) throw new Error("Unclosed subgraph");
  return result;
}
