import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, fontStack, size } from "../../theme.ts";
import { enterProgress } from "../../motion.ts";
import type { Beat } from "../../videos/types.ts";
import { Box, Cross, Land, Link } from "../shapes.tsx";

const P = (x: number, y: number) => ({ x, y });

/** Two ways to carry the same protocol: a pipe inside one machine, and a gated route across a network. */
export const Routes: React.FC<{ beats: Beat[] }> = ({ beats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const at = (i: number) =>
    enterProgress(frame, Math.round((beats[i]?.at ?? 0) * durationInFrames), fps);
  const stdio = at(0);
  const http = at(1);
  const dep = at(2);
  const meta = at(3);
  const t = frame / fps;

  return (
    <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
      {/* stdio: one machine */}
      <Land x={96} y={236} w={900} h={220} title="One machine" lit={Math.max(stdio, 0.0)} />
      <Box x={150} y={330} w={230} h={92} lines={["Host"]} lit={stdio} />
      <Box x={730} y={330} w={230} h={92} lines={["Server"]} lit={stdio} />
      <Link points={[P(380, 376), P(730, 376)]} draw={stdio} tone="route" arrow="both" />
      <text
        x={555}
        y={336}
        textAnchor="middle"
        fontFamily={fontStack.sans}
        fontWeight={550}
        fontSize={24}
        fill={color.route}
        opacity={stdio}
      >
        the process is the connection
      </text>
      <g opacity={Math.max(stdio, 0.3)}>
        <text
          x={1070}
          y={316}
          fontFamily={fontStack.display}
          fontWeight={800}
          fontSize={64}
          fill={color.ink}
        >
          stdio
        </text>
        <text
          x={1070}
          y={364}
          fontFamily={fontStack.sans}
          fontWeight={500}
          fontSize={32}
          fill={color.inkSoft}
        >
          Simplest. No network, no authentication.
        </text>
        <text
          x={1070}
          y={408}
          fontFamily={fontStack.sans}
          fontWeight={500}
          fontSize={32}
          fill={color.inkSoft}
        >
          Only for a server beside the host.
        </text>
      </g>

      {/* Streamable HTTP: across a network */}
      <rect
        x={96}
        y={500}
        width={1728}
        height={400}
        rx={28}
        fill="rgba(79,70,229,0.07)"
        stroke={color.brand500}
        strokeWidth={1.5}
        strokeDasharray="3 9"
        opacity={0.3 + 0.7 * http}
      />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M 120 ${860 - i * 22} ${Array.from({ length: 20 }, (_, k) => `L ${120 + (k * 1680) / 19} ${860 - i * 22 + Math.sin(k * 0.8 + t * 0.8 + i * 1.7) * 6}`).join(" ")}`}
          fill="none"
          stroke={color.brand700}
          strokeWidth={1.4}
          opacity={0.5}
        />
      ))}
      <g opacity={Math.max(http, 0.3)}>
        <text
          x={140}
          y={574}
          fontFamily={fontStack.display}
          fontWeight={800}
          fontSize={64}
          fill={color.ink}
        >
          Streamable HTTP
        </text>
        <text
          x={140}
          y={620}
          fontFamily={fontStack.sans}
          fontWeight={500}
          fontSize={32}
          fill={color.inkSoft}
        >
          Remote and shared, at the cost of real authentication.
        </text>
      </g>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          x={140}
          y={672 + i * 64}
          w={200}
          h={52}
          lines={[`Host ${"ABC"[i]}`]}
          lit={http}
          fontSize={26}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <Link
          key={i}
          points={[P(340, 698 + i * 64), P(880, 698 + i * 64), P(880, 760), P(1300, 760)]}
          draw={http}
          tone="route"
          width={2.6}
          arrow="none"
        />
      ))}
      <g opacity={http}>
        <rect x={868} y={664} width={14} height={192} rx={4} fill={color.brand400} />
        <rect x={938} y={664} width={14} height={192} rx={4} fill={color.brand400} />
        <text
          x={910}
          y={652}
          textAnchor="middle"
          fontFamily={fontStack.display}
          fontStyle="italic"
          fontWeight={600}
          fontSize={28}
          fill={color.brand200}
        >
          authentication
        </text>
      </g>
      <Link points={[P(1300, 760), P(1530, 760)]} draw={http} tone="route" arrow="end" width={4} />
      <Box x={1530} y={715} w={240} h={92} lines={["Server"]} lit={http} />
      <g opacity={http}>
        <text
          x={1100}
          y={730}
          textAnchor="middle"
          fontFamily={fontStack.sans}
          fontWeight={550}
          fontSize={24}
          fill={color.route}
        >
          Mcp-Method · Mcp-Name
        </text>
      </g>

      {/* the overhead of self-describing requests, on both routes */}
      <g opacity={meta}>
        <rect
          x={470}
          y={346}
          width={110}
          height={44}
          rx={8}
          fill={color.sea}
          stroke={color.fault}
          strokeWidth={2.5}
        />
        <text
          x={525}
          y={377}
          textAnchor="middle"
          fontFamily={fontStack.mono}
          fontWeight={500}
          fontSize={24}
          fill={color.fault}
        >
          _meta
        </text>
        <text
          x={130}
          y={444}
          textAnchor="start"
          fontFamily={fontStack.display}
          fontStyle="italic"
          fontWeight={600}
          fontSize={28}
          fill={color.fault}
        >
          overhead it never needed
        </text>
        <rect
          x={1060}
          y={738}
          width={110}
          height={44}
          rx={8}
          fill={color.sea}
          stroke={color.ok}
          strokeWidth={2.5}
        />
        <text
          x={1115}
          y={769}
          textAnchor="middle"
          fontFamily={fontStack.mono}
          fontWeight={500}
          fontSize={24}
          fill={color.ok}
        >
          _meta
        </text>
        <text
          x={985}
          y={826}
          textAnchor="start"
          fontFamily={fontStack.display}
          fontStyle="italic"
          fontWeight={600}
          fontSize={28}
          fill={color.ok}
        >
          worth it behind a load balancer
        </text>
      </g>

      {/* HTTP+SSE: the route no longer taken */}
      <g opacity={0.35 + 0.65 * dep}>
        <line
          x1={96}
          y1={950}
          x2={1010}
          y2={950}
          stroke={color.fault}
          strokeWidth={3}
          strokeDasharray="11 10"
          opacity={interpolate(dep, [0, 1], [0.35, 1])}
        />
        <Cross x={1030} y={950} />
        <text
          x={1070}
          y={960}
          fontFamily={fontStack.sans}
          fontWeight={600}
          fontSize={30}
          fill={color.fault}
        >
          HTTP+SSE is deprecated: not a third option for new work
        </text>
      </g>
    </svg>
  );
};
