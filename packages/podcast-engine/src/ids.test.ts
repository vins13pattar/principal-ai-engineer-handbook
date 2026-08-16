import { describe, expect, it } from "vitest";
import type { SourceExcerpt } from "@handbook/content";
import { deriveExcerptIds, slugForHeading } from "./ids.ts";

/** Minimal excerpt — only documentId, heading and body affect id derivation. */
function excerpt(documentId: string, heading: string, body = "x"): SourceExcerpt {
  return { documentId, url: `/${documentId}/`, title: documentId, heading, body };
}

describe("slugForHeading", () => {
  it("lowercases and joins on runs of punctuation", () => {
    expect(slugForHeading("Why Not LangGraph?")).toBe("why-not-langgraph");
    expect(slugForHeading("  Spaced  Out  ")).toBe("spaced-out");
  });

  it("keeps non-Latin scripts instead of emptying them", () => {
    // Stripping to ASCII would send every Devanagari heading through the
    // empty-slug fallback, collapsing distinct sections onto one label.
    expect(slugForHeading("नमस्ते")).toBe("नमस्ते");
    expect(slugForHeading("வணக்கம்")).toBe("வணக்கம்");
  });

  it("returns empty for a heading with no letters or digits", () => {
    expect(slugForHeading("!!!")).toBe("");
    expect(slugForHeading("—")).toBe("");
  });
});

describe("deriveExcerptIds", () => {
  it("labels an excerpt by document and heading", () => {
    expect(deriveExcerptIds([excerpt("module:06-mcp", "Security")])).toEqual([
      "module:06-mcp#security",
    ]);
  });

  it("disambiguates a document that repeats a heading", () => {
    const ids = deriveExcerptIds([excerpt("doc", "Foo"), excerpt("doc", "Foo")]);

    expect(ids).toEqual(["doc#foo", "doc#foo-2"]);
  });

  it("disambiguates different headings that normalise to one slug", () => {
    // Collision resolution keys on the slug, not the raw heading.
    const ids = deriveExcerptIds([excerpt("doc", "Why not?"), excerpt("doc", "Why not")]);

    expect(ids).toEqual(["doc#why-not", "doc#why-not-2"]);
  });

  it("keeps a generated suffix from colliding with a natural slug", () => {
    // Counting uses per base issues foo-2 for the second Foo, and then Foo 2
    // slugs naturally to foo-2 and collides with it.
    const ids = deriveExcerptIds([
      excerpt("doc", "Foo"),
      excerpt("doc", "Foo"),
      excerpt("doc", "Foo 2"),
    ]);

    expect(ids).toEqual(["doc#foo", "doc#foo-2", "doc#foo-2-2"]);
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps them distinct in the other order too", () => {
    // Only this ordering fails if the probe looks ahead instead of at what
    // has already been issued.
    const ids = deriveExcerptIds([
      excerpt("doc", "Foo"),
      excerpt("doc", "Foo 2"),
      excerpt("doc", "Foo"),
    ]);

    expect(ids).toEqual(["doc#foo", "doc#foo-2", "doc#foo-3"]);
    expect(new Set(ids).size).toBe(3);
  });

  it("falls back to the ordinal for a heading with no slug", () => {
    const ids = deriveExcerptIds([excerpt("doc", "Intro"), excerpt("doc", "!!!")]);

    expect(ids).toEqual(["doc#intro", "doc#section-1"]);
  });

  it("separates an empty-slug fallback from a natural Section heading", () => {
    expect(deriveExcerptIds([excerpt("doc", "!!!"), excerpt("doc", "Section 0")])).toEqual([
      "doc#section-0",
      "doc#section-0-2",
    ]);
    expect(deriveExcerptIds([excerpt("doc", "Section 0"), excerpt("doc", "!!!")])).toEqual([
      "doc#section-0",
      "doc#section-1",
    ]);
  });

  it("counts the ordinal per document, not across the pack", () => {
    const ids = deriveExcerptIds([excerpt("a", "Intro"), excerpt("b", "!!!"), excerpt("a", "!!!")]);

    expect(ids).toEqual(["a#intro", "b#section-0", "a#section-1"]);
  });

  it("is stable for one pack, and relative to order across packs", () => {
    const intro = excerpt("doc", "Intro");
    const unslugged = excerpt("doc", "!!!");

    // Same pack twice: identical, so a prompt and a validation pass agree.
    expect(deriveExcerptIds([intro, unslugged])).toEqual(deriveExcerptIds([intro, unslugged]));

    // Reordered: the same excerpt legitimately takes a different id, because
    // the id labels a position. This is why comparing ids across packs is a
    // category error rather than a bug to be fixed with a global key.
    expect(deriveExcerptIds([intro, unslugged])).toEqual(["doc#intro", "doc#section-1"]);
    expect(deriveExcerptIds([unslugged, intro])).toEqual(["doc#section-0", "doc#intro"]);
  });

  it("issues globally unique ids", () => {
    const excerpts = [
      excerpt("doc", "Foo"),
      excerpt("doc", "Foo"),
      excerpt("doc", "Foo 2"),
      excerpt("doc", "Foo-2"),
      excerpt("doc", "!!!"),
      excerpt("doc", "Section 4"),
    ];

    const ids = deriveExcerptIds(excerpts);

    expect(new Set(ids).size).toBe(excerpts.length);
  });
});
