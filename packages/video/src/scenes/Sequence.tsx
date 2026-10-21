import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { SEQUENCES } from "../generated/sequences.ts";
import { color, fontStack, size } from "../theme.ts";
import { cameraProgress, enterProgress } from "../motion.ts";
import type { SequenceItem } from "../../scripts/mermaid-sequence.ts";

interface Step {
  at: number;
  upTo: number;
}

const TOP = 214;
const HEAD_H = 66;
const ROW = 62;
const LEFT = 96;
const WIDTH = 1728;

/** A sequence diagram, revealed message by message, with every lifeline and message drawn faintly from the start. */
export const Sequence: React.FC<{ layout: string; steps: Step[] }> = ({ layout, steps }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const model = SEQUENCES[layout];
  if (!model) throw new Error(`Unknown sequence diagram ${layout}`);

  const n = model.participants.length;
  const colW = WIDTH / n;
  const x = (id: string) => LEFT + colW * (model.participants.findIndex((p) => p.id === id) + 0.5);

  // One row per drawn item; `end` closes a block and takes none.
  const rows: { item: SequenceItem; index: number; y: number }[] = [];
  let y = TOP + HEAD_H + 54;
  model.items.forEach((item, index) => {
    if (item.type === "end") {
      rows.push({ item, index, y: y - ROW / 2 });
      return;
    }
    rows.push({ item, index, y });
    y += ROW;
  });
  const bottom = y;

  const starts = steps.map((s) => Math.max(0, Math.round(s.at * durationInFrames)));
  let active = -1;
  starts.forEach((s, i) => {
    if (frame >= s) active = i;
  });
  const upTo = active >= 0 ? steps[active]!.upTo : -1;

  // Pan down as the story moves below the fold.
  const visibleBottom = 930;
  const targetRow =
    rows.find((r) => r.index === Math.min(upTo + 1, rows.length - 1)) ?? rows.at(-1)!;
  const over = Math.max(0, targetRow.y + ROW / 2 - visibleBottom);
  const prevUp = active > 0 ? steps[active - 1]!.upTo : -1;
  const prevRow = rows.find((r) => r.index === Math.min(prevUp + 1, rows.length - 1)) ?? rows[0]!;
  const prevOver = Math.max(0, prevRow.y + ROW / 2 - visibleBottom);
  const p = active >= 0 ? cameraProgress(frame, starts[active]!, fps) : 1;
  const pan = prevOver + (over - prevOver) * p;

  const revealedAt = (index: number): number => {
    const stepIndex = steps.findIndex((s) => s.upTo >= index);
    if (stepIndex < 0) return 0;
    return enterProgress(frame, starts[stepIndex]!, fps);
  };

  // alt blocks: from each `alt` row to its matching `end`.
  const blocks: {
    label: string;
    from: number;
    to: number;
    elseAt: { y: number; label: string }[];
    index: number;
  }[] = [];
  const open: number[] = [];
  rows.forEach((r) => {
    if (r.item.type === "alt") {
      blocks.push({ label: r.item.label, from: r.y, to: bottom, elseAt: [], index: r.index });
      open.push(blocks.length - 1);
    } else if (r.item.type === "else" && open.length > 0) {
      blocks[open.at(-1)!]!.elseAt.push({ y: r.y, label: r.item.label });
    } else if (r.item.type === "end" && open.length > 0) {
      blocks[open.pop()!]!.to = r.y;
    }
  });

  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
      <clipPath id="seq-clip">
        <rect x={0} y={TOP - 10} width={size.width} height={visibleBottom - TOP + 22} />
      </clipPath>
      <g clipPath="url(#seq-clip)">
        <g transform={`translate(0 ${-pan})`}>
          {model.participants.map((part) => (
            <g key={part.id}>
              <line
                x1={x(part.id)}
                y1={TOP + HEAD_H}
                x2={x(part.id)}
                y2={bottom + 20}
                stroke={color.brand600}
                strokeWidth={2}
                strokeDasharray="4 10"
                opacity={0.8}
              />
              <rect
                x={x(part.id) - 130}
                y={TOP}
                width={260}
                height={HEAD_H}
                rx={12}
                fill={color.place}
                stroke={color.brand300}
                strokeWidth={1.8}
              />
              <text
                x={x(part.id)}
                y={TOP + HEAD_H / 2 + 10}
                textAnchor="middle"
                fill={color.ink}
                fontFamily={fontStack.sans}
                fontWeight={650}
                fontSize={28}
              >
                {part.label}
              </text>
            </g>
          ))}

          {blocks.map((b) => {
            const lit = revealedAt(b.index);
            return (
              <g key={b.index}>
                <rect
                  x={LEFT + 20}
                  y={b.from - ROW / 2 + 6}
                  width={WIDTH - 40}
                  height={b.to - b.from + ROW / 2 - 6 + 10}
                  rx={14}
                  fill="none"
                  stroke={color.brand500}
                  strokeWidth={1.6}
                  opacity={0.35 + 0.65 * lit}
                />
                <text
                  x={LEFT + 38}
                  y={b.from - 4}
                  fill={color.brand200}
                  fontFamily={fontStack.display}
                  fontStyle="italic"
                  fontWeight={600}
                  fontSize={26}
                  opacity={0.35 + 0.65 * lit}
                >
                  {`if ${b.label}`}
                </text>
                {b.elseAt.map((e) => (
                  <g key={e.y} opacity={0.35 + 0.65 * lit}>
                    <line
                      x1={LEFT + 20}
                      y1={e.y - ROW / 2 + 8}
                      x2={LEFT + WIDTH - 20}
                      y2={e.y - ROW / 2 + 8}
                      stroke={color.brand500}
                      strokeWidth={1.6}
                      strokeDasharray="8 8"
                    />
                    <text
                      x={LEFT + 38}
                      y={e.y - 2}
                      fill={color.brand200}
                      fontFamily={fontStack.display}
                      fontStyle="italic"
                      fontWeight={600}
                      fontSize={26}
                    >
                      {`otherwise${e.label ? ` ${e.label}` : ""}`}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}

          {rows.map(({ item, index, y: ry }) => {
            if (item.type === "message") {
              const x1 = x(item.from);
              const x2 = x(item.to);
              const lit = revealedAt(index);
              const dir = x2 > x1 ? 1 : -1;
              const tip = x2 - dir * 4;
              return (
                <g key={index}>
                  <line
                    x1={x1}
                    y1={ry}
                    x2={x2}
                    y2={ry}
                    stroke={color.brand600}
                    strokeWidth={2}
                    strokeDasharray="3 9"
                    opacity={0.55 * (1 - lit)}
                  />
                  <g opacity={lit}>
                    <line
                      x1={x1}
                      y1={ry}
                      x2={tip - dir * 12}
                      y2={ry}
                      stroke={index === upTo ? color.route : color.brand300}
                      strokeWidth={index === upTo ? 4 : 3}
                      strokeDasharray={item.dashed ? "10 9" : undefined}
                      strokeLinecap="round"
                    />
                    <path
                      d={`M ${tip} ${ry} L ${tip - dir * 18} ${ry - 8} L ${tip - dir * 18} ${ry + 8} Z`}
                      fill={index === upTo ? color.route : color.brand300}
                    />
                    <Label
                      cx={(x1 + x2) / 2}
                      y={ry - 12}
                      text={item.text}
                      tone={index === upTo ? "route" : "normal"}
                    />
                  </g>
                </g>
              );
            }
            if (item.type === "note") {
              const lit = revealedAt(index);
              const xs = item.over.map(x);
              const x1 = Math.min(...xs) - 150;
              const x2 = Math.max(...xs) + 150;
              return (
                <g key={index} opacity={0.25 + 0.75 * lit}>
                  <rect
                    x={x1}
                    y={ry - 24}
                    width={x2 - x1}
                    height={48}
                    rx={10}
                    fill={color.sea}
                    stroke={color.route}
                    strokeWidth={index === upTo ? 3 : 1.8}
                  />
                  <text
                    x={(x1 + x2) / 2}
                    y={ry + 8}
                    textAnchor="middle"
                    fill={color.route}
                    fontFamily={fontStack.display}
                    fontStyle="italic"
                    fontWeight={600}
                    fontSize={26}
                  >
                    {item.text}
                  </text>
                </g>
              );
            }
            return null;
          })}
        </g>
      </g>
    </svg>
  );
};

const Label: React.FC<{ cx: number; y: number; text: string; tone: "route" | "normal" }> = ({
  cx,
  y,
  text,
  tone,
}) => {
  const w = text.length * 13.2 + 24;
  return (
    <g>
      <rect
        x={cx - w / 2}
        y={y - 24}
        width={w}
        height={32}
        rx={8}
        fill={color.sea}
        stroke={tone === "route" ? color.route : color.brand600}
        strokeWidth={1.4}
      />
      <text
        x={cx}
        y={y - 1}
        textAnchor="middle"
        fill={tone === "route" ? color.route : color.inkSoft}
        fontFamily={fontStack.sans}
        fontWeight={550}
        fontSize={22}
      >
        {text}
      </text>
    </g>
  );
};
