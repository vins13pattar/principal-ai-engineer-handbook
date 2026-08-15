# @handbook/content

Reads the handbook's own pages into typed documents, and assembles the source packs the podcast
engine generates episodes from.

The language and framework choices behind this package are recorded in
[ADR-0008](https://handbook.vinodspattar.in/adr/decisions/0008-typescript-podcast-pipeline/).

## Why this is TypeScript

The content is MDX, its schemas are Zod in `@handbook/shared`, and its structural contract is
enforced by `scripts/lint-content-structure.ts`. A Python loader would reimplement all three and
drift from them silently. Here, `extractFrontmatter` and the freshness classification are imports.

## Try it

From the repository root:

```bash
node --experimental-strip-types packages/handbook-content/src/cli.ts
node --experimental-strip-types packages/handbook-content/src/cli.ts module:15-agent-identity
```

```text
Module 15: Agent Identity and Access

  primary       module:15-agent-identity  (v1.1.0)
  related       module:05-agent-engineering, lab:policy-gated-tool-runtime, ...
  excerpts      74
  est. tokens   24,183
  source hash   6f6da3e9aae8aedf
```

## What it does

| Module           | Responsibility                                                    |
| ---------------- | ----------------------------------------------------------------- |
| `collections.ts` | Where each content type lives on disk and at what URL             |
| `mdx.ts`         | Strips MDX components without touching fenced code                |
| `loader.ts`      | Parses a page into frontmatter, `##` sections, and outbound links |
| `source-pack.ts` | Follows links outward, applies a token budget, hashes the sources |

A **document id** is `<collection>:<slug>` — `module:06-mcp`, `lab:semantic-cache`. Ids are derived
from site URLs too, so a related-content link inside a page resolves to a document.

## Three things it gets right on purpose

**Stripping components keeps their text.** An `<Aside>` usually carries the sharpest caveat on the
page — "production-shaped, not production-ready" lives inside one. Dropping component bodies would
discard exactly the material worth talking about. Titles are lifted off tags before stripping,
because a `<Mermaid>` title is the only prose description of a diagram that renders client-side.

**Code fences are never touched.** Inside a fence, `<T>` is a generic and `{"x": 1}` is JSON. A
stripper that ignores fences corrupts the code examples, which are usually the point of the page.

**The budget names what it dropped.** A pack that silently returned only its primary document looks
identical to a page with no related links. `droppedForBudget` makes the difference visible.

## Two bugs its own tests caught

The tests run against the live content tree rather than fixtures, which is the only reason both of
these surfaced.

**Two collections loaded as empty and the suite passed.** Architecture pages live under
`architecture/systems/` and cheat sheets under `cheatsheets/sheets/`; the first version pointed at
the parent directories. `readdir` on a directory of subdirectories returns no `.mdx` files, so those
collections came back empty rather than erroring — and a test asserting "more than forty documents
total" passed with 50 while a quarter of the handbook was missing. It now asserts a floor per
collection, which is the shape of assertion that can see this.

**A type error in `@handbook/shared` did not fail `pnpm verify`.** Wiring this package in revealed
that `pnpm check` only ran `astro check` on the site; the packages' own `check` scripts were never
invoked. Confirmed by introducing a deliberate error and watching the build stay green. `pnpm check`
now covers every workspace package.

## Verify it

```bash
pnpm --filter @handbook/content test
pnpm --filter @handbook/content check
```

33 tests. Both run as part of `pnpm verify` at the repository root.

## Not done yet

- **Section-level excerpting.** A pack takes whole documents. Module 15 plus one hop is already
  24,183 estimated tokens against a 25,000 default, so selecting relevant sections rather than whole
  related pages is the next thing the budget will force.
- **`estimateTokens` is four-characters-per-token**, not a real tokeniser. Fine for a budget guard,
  wrong for anything that needs an exact count.
- **Anchors are dropped when resolving links.** `/learn/modules/06-mcp/#security` resolves to the
  whole module, so a pack pulls in more than the linking page pointed at.
