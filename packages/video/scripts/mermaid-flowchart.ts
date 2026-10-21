/**
 * Parses the subset of Mermaid flowchart syntax the handbook's diagrams use: `flowchart` or `graph`
 * with `LR|TB|TD|RL|BT`, `subgraph`/`end` with an optional `direction`, node shapes (`[box]`,
 * `{decision}`, `([terminal])`, `[(store)]`, `((circle))`, `(rounded)`), and the arrows `-->`,
 * `---`, `==>`, `<-->`, `-.->`, `-.label.->` and `-- label -->`, each with an optional `|label|`.
 * Styling lines (`classDef`, `class`, `style`, `linkStyle`) are ignored. Anything else throws, so a
 * diagram that grows past the subset fails loudly instead of rendering wrong.
 */

export type Direction = "LR" | "TB" | "RL" | "BT";
export type Shape = "box" | "decision" | "terminal" | "store" | "circle";

export interface ParsedNode {
  id: string;
  label: string[];
  parent: string | null;
  shape: Shape;
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
  /** `---` joins two things without an arrowhead. */
  arrow: boolean;
}

export interface ParsedFlowchart {
  direction: Direction;
  nodes: ParsedNode[];
  groups: ParsedGroup[];
  edges: ParsedEdge[];
}

const SHAPES: { open: string; close: string; shape: Shape }[] = [
  { open: "[(", close: ")]", shape: "store" },
  { open: "([", close: "])", shape: "terminal" },
  { open: "((", close: "))", shape: "circle" },
  { open: "[", close: "]", shape: "box" },
  { open: "{", close: "}", shape: "decision" },
  { open: "(", close: ")", shape: "box" },
];

const IGNORED = /^(classDef|class|style|linkStyle|click|accTitle|accDescr)\b/;
const SUBGRAPH = /^subgraph\s+([A-Za-z0-9_]+)(?:\[(.*)\])?$/;
const DIRECTION = /^direction\s+(LR|TB|TD|RL|BT)$/;
const ID = /^[A-Za-z0-9_]+/;

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

function direction(value: string): Direction {
  return value === "TD" ? "TB" : (value as Direction);
}

interface NodeRef {
  id: string;
  label: string | null;
  shape: Shape | null;
}

/** Reads `ID` plus an optional shaped label at `pos`; returns the reference and the new position. */
function readNode(line: string, pos: number): { ref: NodeRef; next: number } {
  const rest = line.slice(pos);
  const id = rest.match(ID)?.[0];
  if (!id) throw new Error(`Expected a node id in: ${line}`);
  let next = pos + id.length;
  for (const { open, close, shape } of SHAPES) {
    if (!line.startsWith(open, next)) continue;
    let start = next + open.length;
    let label: string;
    if (line[start] === '"') {
      const end = line.indexOf('"', start + 1);
      if (end < 0) throw new Error(`Unclosed quote in: ${line}`);
      label = line.slice(start, end + 1);
      start = end + 1;
      if (!line.startsWith(close, start)) throw new Error(`Expected ${close} in: ${line}`);
    } else {
      const end = line.indexOf(close, start);
      if (end < 0) throw new Error(`Expected ${close} in: ${line}`);
      label = line.slice(start, end);
      start = end;
    }
    next = start + close.length;
    return { ref: { id, label, shape }, next };
  }
  return { ref: { id, label: null, shape: null }, next };
}

interface ArrowToken {
  length: number;
  dashed: boolean;
  bidirectional: boolean;
  arrow: boolean;
  label: string | null;
}

function readArrow(line: string, pos: number): ArrowToken | null {
  const rest = line.slice(pos);
  const dottedLabel = rest.match(/^-\.(?!>)(.*?)\.->/);
  if (dottedLabel) {
    return {
      length: dottedLabel[0].length,
      dashed: true,
      bidirectional: false,
      arrow: true,
      label: dottedLabel[1]!.trim(),
    };
  }
  const spaced = rest.match(/^--\s+(?!>)(.*?)\s+-->/);
  if (spaced) {
    return {
      length: spaced[0].length,
      dashed: false,
      bidirectional: false,
      arrow: true,
      label: spaced[1]!.trim(),
    };
  }
  const plain = rest.match(/^(<-->|-\.->|-->|==>|---)/);
  if (!plain) return null;
  const token = plain[0];
  return {
    length: token.length,
    dashed: token === "-.->",
    bidirectional: token === "<-->",
    arrow: token !== "---",
    label: null,
  };
}

export function parseFlowchart(source: string): ParsedFlowchart {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"));

  const header = lines.shift();
  const headerMatch = header?.match(/^(?:flowchart|graph)\s+(LR|TB|TD|RL|BT)$/);
  if (!headerMatch) throw new Error(`Unsupported flowchart header: ${header ?? "(empty)"}`);

  const result: ParsedFlowchart = {
    direction: direction(headerMatch[1]!),
    nodes: [],
    groups: [],
    edges: [],
  };
  const stack: ParsedGroup[] = [];
  const group = (id: string) => result.groups.find((g) => g.id === id);
  const node = (id: string) => result.nodes.find((n) => n.id === id);

  const declare = (ref: NodeRef) => {
    const here = stack.at(-1)?.id ?? null;
    const existingGroup = group(ref.id);
    if (existingGroup) {
      // A bare mention of a subgraph inside another subgraph nests it there.
      if (existingGroup.parent === null && here !== null && here !== existingGroup.id)
        existingGroup.parent = here;
      return;
    }
    const existing = node(ref.id);
    if (!existing) {
      result.nodes.push({
        id: ref.id,
        label: ref.label === null ? [ref.id] : toLines(ref.label),
        parent: here,
        shape: ref.shape ?? "box",
      });
      return;
    }
    if (ref.label !== null) {
      existing.label = toLines(ref.label);
      existing.shape = ref.shape ?? existing.shape;
      if (existing.parent === null) existing.parent = here;
    }
  };

  for (const line of lines) {
    if (IGNORED.test(line)) continue;
    const sub = line.match(SUBGRAPH);
    if (sub) {
      const [, id = "", title] = sub;
      const g: ParsedGroup = {
        id,
        title: toLines(title ?? id),
        parent: stack.at(-1)?.id ?? null,
        direction: null,
      };
      result.groups.push(g);
      stack.push(g);
      continue;
    }
    if (line === "end") {
      stack.pop();
      continue;
    }
    const dir = line.match(DIRECTION);
    if (dir) {
      const current = stack.at(-1);
      if (!current) throw new Error("`direction` outside a subgraph");
      current.direction = direction(dir[1]!);
      continue;
    }

    // A statement is a node, then any number of (arrow, node) pairs.
    let pos = 0;
    let { ref, next } = readNode(line, pos);
    declare(ref);
    let previous = ref.id;
    pos = next;
    while (pos < line.length) {
      while (line[pos] === " ") pos++;
      if (pos >= line.length) break;
      const arrow = readArrow(line, pos);
      if (!arrow) throw new Error(`Unsupported flowchart line: ${line}`);
      pos += arrow.length;
      while (line[pos] === " ") pos++;
      let label = arrow.label;
      if (line[pos] === "|") {
        const end = line.indexOf("|", pos + 1);
        if (end < 0) throw new Error(`Unclosed edge label in: ${line}`);
        label = line.slice(pos + 1, end);
        pos = end + 1;
        while (line[pos] === " ") pos++;
      }
      ({ ref, next } = readNode(line, pos));
      declare(ref);
      result.edges.push({
        id: `e${result.edges.length + 1}`,
        from: previous,
        to: ref.id,
        label: label === null ? [] : toLines(label),
        dashed: arrow.dashed,
        bidirectional: arrow.bidirectional,
        arrow: arrow.arrow,
      });
      previous = ref.id;
      pos = next;
    }
  }

  if (stack.length > 0) throw new Error("Unclosed subgraph");
  return result;
}
