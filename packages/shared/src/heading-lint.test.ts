import { describe, expect, it } from "vitest";
import { extractHeadings, findMissingSections } from "./heading-lint.ts";

describe("extractHeadings", () => {
  it("extracts level-2 headings in document order", () => {
    const body = [
      "# Title",
      "",
      "Some intro text.",
      "",
      "## Status",
      "",
      "Accepted.",
      "",
      "## Context",
      "",
      "### Not a top-level section",
      "",
      "## Decision",
    ].join("\n");

    expect(extractHeadings(body)).toEqual(["Status", "Context", "Decision"]);
  });

  it("returns an empty array when there are no level-2 headings", () => {
    expect(extractHeadings("# Just a title\n\nSome text.")).toEqual([]);
  });
});

describe("findMissingSections", () => {
  const required = ["Status", "Context", "Problem", "Decision"];

  it("returns sections not present, in required order", () => {
    expect(findMissingSections(["Context", "Status"], required)).toEqual(["Problem", "Decision"]);
  });

  it("returns an empty array when every required section is present", () => {
    expect(findMissingSections(required, required)).toEqual([]);
  });
});
