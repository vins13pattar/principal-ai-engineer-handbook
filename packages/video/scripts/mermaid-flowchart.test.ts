import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFlowchart } from "./mermaid-flowchart.ts";

const modules = resolve(
  import.meta.dirname,
  "../../../apps/handbook/src/content/docs/learn/modules",
);
const read = (name: string) => readFileSync(resolve(modules, `${name}.mmd`), "utf8");

describe("parseFlowchart", () => {
  it("parses the host/client/server diagram", () => {
    const chart = parseFlowchart(read("06-mcp.host-client-server"));
    expect(chart.direction).toBe("LR");
    expect(chart.groups.map((g) => g.id)).toEqual(["Host"]);
    expect(chart.nodes.map((n) => n.id)).toEqual(["C1", "C2", "S1", "S2", "Model"]);
    expect(chart.nodes.find((n) => n.id === "C1")?.parent).toBe("Host");
    expect(chart.nodes.find((n) => n.id === "S1")?.label).toEqual([
      "Server: filesystem",
      "(exposes Resources)",
    ]);
    expect(chart.edges).toHaveLength(3);
    expect(chart.edges[0]).toMatchObject({
      from: "C1",
      to: "S1",
      bidirectional: true,
      dashed: false,
    });
  });

  it("treats a subgraph as an edge endpoint, not a node", () => {
    const chart = parseFlowchart(read("06-mcp.host-client-server"));
    expect(chart.edges[2]).toMatchObject({ from: "Host", to: "Model" });
    expect(chart.nodes.some((n) => n.id === "Host")).toBe(false);
  });

  it("parses nested directions, <br/> breaks and dashed edges", () => {
    const chart = parseFlowchart(read("06-mcp.stateless-routing"));
    expect(chart.direction).toBe("TB");
    expect(chart.groups.map((g) => g.direction)).toEqual(["TB", "TB"]);
    expect(chart.nodes.find((n) => n.id === "BS1")?.label).toEqual([
      "Server instance A",
      "(holds session state)",
    ]);
    expect(chart.edges.filter((e) => e.dashed).map((e) => e.id)).toEqual(["e3", "e8"]);
  });

  it("fails loudly on syntax outside the supported subset", () => {
    expect(() => parseFlowchart("flowchart LR\n  A --o B")).toThrow(/Unsupported/);
    expect(() => parseFlowchart("sequenceDiagram\n  A->>B: hi")).toThrow(/header/);
  });
});
