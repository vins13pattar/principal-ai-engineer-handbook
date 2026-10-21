/**
 * Parses the subset of Mermaid sequence diagrams the handbook uses: `participant X as Label`,
 * messages (`->>`, `-->>`), `Note over A,B: text`, and `alt` / `else` / `end` blocks. Anything
 * else throws, so a diagram that outgrows the subset fails loudly instead of drawing wrong.
 */

export interface SequenceParticipant {
  id: string;
  label: string;
}

export type SequenceItem =
  | { type: "message"; from: string; to: string; text: string; dashed: boolean; depth: number }
  | { type: "note"; over: string[]; text: string; depth: number }
  | { type: "alt"; label: string; depth: number }
  | { type: "else"; label: string; depth: number }
  | { type: "end"; depth: number };

export interface ParsedSequence {
  participants: SequenceParticipant[];
  items: SequenceItem[];
}

export function parseSequence(source: string): ParsedSequence {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"));
  if (lines.shift() !== "sequenceDiagram") throw new Error("Not a sequence diagram");

  const participants: SequenceParticipant[] = [];
  const items: SequenceItem[] = [];
  let depth = 0;
  const ensure = (id: string) => {
    if (!participants.some((p) => p.id === id)) participants.push({ id, label: id });
  };

  for (const line of lines) {
    const declared = line.match(/^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/);
    if (declared) {
      const [, id = "", label] = declared;
      const existing = participants.find((p) => p.id === id);
      if (existing) existing.label = label ?? existing.label;
      else participants.push({ id, label: label ?? id });
      continue;
    }
    const note = line.match(/^Note\s+over\s+([\w,\s]+?):\s*(.+)$/i);
    if (note) {
      const over = note[1]!.split(",").map((s) => s.trim());
      over.forEach(ensure);
      items.push({ type: "note", over, text: note[2]!.trim(), depth });
      continue;
    }
    const alt = line.match(/^alt\s+(.+)$/);
    if (alt) {
      items.push({ type: "alt", label: alt[1]!.trim(), depth });
      depth++;
      continue;
    }
    const otherwise = line.match(/^else\s*(.*)$/);
    if (otherwise) {
      items.push({ type: "else", label: otherwise[1]!.trim(), depth: depth - 1 });
      continue;
    }
    if (line === "end") {
      depth--;
      items.push({ type: "end", depth });
      continue;
    }
    const message = line.match(/^(\w+)\s*(-->>|->>)\s*(\w+)\s*:\s*(.+)$/);
    if (message) {
      const [, from = "", arrow = "", to = "", text = ""] = message;
      ensure(from);
      ensure(to);
      items.push({ type: "message", from, to, text: text.trim(), dashed: arrow === "-->>", depth });
      continue;
    }
    throw new Error(`Unsupported sequence line: ${line}`);
  }
  return { participants, items };
}
