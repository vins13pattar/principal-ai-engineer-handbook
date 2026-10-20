import { describe, expect, it } from "vitest";
import { mcp } from "./mcp.ts";
import { chapters, youtubeDescription, youtubeTitle } from "./youtube.ts";

describe("youtube metadata", () => {
  it("titles the video with the module number first", () => {
    expect(youtubeTitle(mcp)).toBe("Module 06: MCP: why the protocol went stateless");
  });

  it("starts chapters at 0:00 and gives one per scene, in order", () => {
    const marks = chapters(mcp);
    expect(marks[0]).toEqual({ at: "0:00", title: mcp.scenes[0]!.headline });
    expect(marks).toHaveLength(mcp.scenes.length);
    const seconds = marks.map(({ at }) => Number(at.split(":")[0]) * 60 + Number(at.split(":")[1]));
    expect(seconds).toEqual([...seconds].sort((a, b) => a - b));
  });

  it("puts the links, chapters and AI-narration disclosure in the description", () => {
    const text = youtubeDescription(mcp);
    expect(text).toContain("https://handbook.vinodspattar.in/learn/modules/06-mcp/");
    expect(text).toContain("0:00 Every app, every tool");
    expect(text.trim().endsWith("Narration is AI-generated.")).toBe(true);
  });
});
