import { describe, expect, it } from "vitest";
import { extractComponentTitles, splitOnCodeFences, stripMdxSyntax } from "./mdx.ts";

describe("stripMdxSyntax", () => {
  it("removes component tags but keeps what they wrap", () => {
    const source = [
      'import { Aside } from "@astrojs/starlight/components";',
      "",
      '<Aside type="caution" title="production-shaped, not production-ready">',
      "  No model is called.",
      "</Aside>",
    ].join("\n");

    const result = stripMdxSyntax(source);

    expect(result).toBe("No model is called.");
  });

  it("leaves angle brackets inside code fences alone", () => {
    // The failure this pins: treating a generic parameter as a JSX tag and
    // deleting it, which corrupts the code examples that are usually the
    // point of the page.
    const source = ["```python", "def f(x: list[int]) -> Mapping[str, int]: ...", "```"].join("\n");

    expect(stripMdxSyntax(source)).toContain("Mapping[str, int]");
  });

  it("does not delete a dict literal in code that looks like a JSX expression", () => {
    const source = ["```json", '{ "cacheScope": "public" }', "```"].join("\n");

    expect(stripMdxSyntax(source)).toContain('"cacheScope": "public"');
  });

  it("leaves lowercase HTML alone, because MDX only treats capitalised tags as components", () => {
    expect(stripMdxSyntax("a <br /> b")).toBe("a <br /> b");
  });

  it("removes a self-closing component with attributes", () => {
    expect(stripMdxSyntax('<Mermaid code={flow} title="Request path" />')).toBe("");
  });
});

describe("splitOnCodeFences", () => {
  it("closes a fence only on a marker at least as long as the opener", () => {
    // A four-backtick fence wrapping a three-backtick block is how this repo
    // shows Markdown inside Markdown; a naive splitter ends the outer block
    // at the inner one and mislabels the rest of the page as prose.
    const source = ["````markdown", "```python", "x = 1", "```", "````", "after"].join("\n");

    const segments = splitOnCodeFences(source);

    expect(segments).toHaveLength(2);
    expect(segments[0]!.isCode).toBe(true);
    expect(segments[0]!.text).toContain("x = 1");
    expect(segments[1]!.text.trim()).toBe("after");
  });

  it("treats an unterminated fence as code rather than reverting to prose", () => {
    const segments = splitOnCodeFences(["```python", "x = 1"].join("\n"));

    expect(segments).toHaveLength(1);
    expect(segments[0]!.isCode).toBe(true);
  });
});

describe("extractComponentTitles", () => {
  it("keeps titles that would otherwise be stripped with the tag", () => {
    const source = [
      '<Mermaid code={significance} title="From two runs to a decision" />',
      '<Aside type="caution" title="production-shaped">body</Aside>',
    ].join("\n");

    expect(extractComponentTitles(source)).toEqual([
      "From two runs to a decision",
      "production-shaped",
    ]);
  });

  it("ignores a title attribute inside a code fence", () => {
    const source = ["```html", '<Widget title="not real content" />', "```"].join("\n");

    expect(extractComponentTitles(source)).toEqual([]);
  });
});
