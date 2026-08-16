# Episode Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `plan` stage of the podcast pipeline — turn a `SourcePack` into a validated `EpisodePlan` where the model supplies judgment and one relative weight, and TypeScript supplies every number that stands on its own.

**Architecture:** A new workspace package `@handbook/podcast-engine`. One `LlmPort.generate` call returns ordered beats with citations and relative weights; pure functions then validate the citations, allocate source characters weight-proportionally with integer largest-remainder, convert weights to seconds under a source-derived ceiling, and solve the segment budget by inverting `projectRenderSeconds`. The model supplies exactly one number, `weight`, and it is purely relative — no absolute or operational figure comes from the model, and every duration, character count, and segment bound is computed here.

**Tech Stack:** TypeScript run under `node --experimental-strip-types`, Zod 4 for the model boundary, Vitest 4, pnpm workspaces.

**Spec:** [docs/superpowers/specs/2026-08-16-episode-planner-design.md](../specs/2026-08-16-episode-planner-design.md) at commit `37e896e`. The spec is the authority; where this plan and the spec disagree, the spec wins and the plan is wrong.

## Global Constraints

- **Runtime is `node --experimental-strip-types`.** Types are erased, not transformed. No parameter properties (`constructor(private readonly x)`), no `enum`, no namespaces. Vitest transpiles and will not catch these — only `pnpm check` will.
- **Relative imports carry the `.ts` extension** (`./ids.ts`), because `allowImportingTsExtensions` is on.
- **`verbatimModuleSyntax` is on:** type-only imports must use `import type`.
- **`noUncheckedIndexedAccess` is on:** `array[i]` is `T | undefined`. Every index access needs a guard or a non-null assertion you can justify.
- **`exactOptionalPropertyTypes` is on:** you cannot assign `undefined` to an optional property; omit the key instead.
- **This package must never import `ai` or any `@ai-sdk/*` package.** It talks to `LlmPort` only.
- **No network in any test.** `FakeLlm` from `@handbook/podcast-providers` is the only model.
- **Dependency versions match the sibling packages exactly:** `@types/node` 22.20.1, `typescript` 6.0.3, `vitest` 4.1.10, `zod` 4.4.3. Workspace deps use `workspace:*`.
- **`no-console` is a lint warning** (only `warn`/`error` allowed). Engine code logs nothing.
- **`pnpm verify` is the gate:** `lint && format:check && check && lint:content && test && build`. Run `npx prettier --write` on touched files before committing or `format:check` fails.
- **Measured cost constants used in tests:** `fixedSeconds 3.16`, `marginalRtf 0.073`, from commit `66face3`.

## File Structure

```text
packages/podcast-engine/
  package.json          workspace wiring, deps pinned to sibling versions
  tsconfig.json         extends ../../tsconfig.base.json
  vitest.config.ts      project name @handbook/podcast-engine
  README.md             what the stage does and the two things it refuses to do
  src/
    ids.ts              excerpt id derivation — slug, fallback, global uniqueness
    ids.test.ts
    schema.ts           DraftPlan (what the model answers) + EpisodePlan (the artifact)
    schema.test.ts
    budget.ts           PlanBudget validation, segment budget solve, assertWithinBudget
    budget.test.ts
    apportion.ts        character allocation, weights to seconds, shortfall
    apportion.test.ts
    plan.ts             renderPrompt, validateCitations, planEpisode
    plan.test.ts
    corpus.test.ts      the live-content-tree test
    index.ts            public surface
```

**Deviation from the spec, deliberate.** The spec sketches two modules (`schema.ts`, `plan.ts`). This plan splits the arithmetic into `budget.ts` and `apportion.ts`, and id derivation into `ids.ts`. Each is a pure-function module with its own substantial test suite, and the spec's own invariants are stated per-mechanism — keeping them in one file would produce a `plan.ts` that no reviewer can hold in their head. The spec's public behaviour is unchanged; `index.ts` gives consumers one surface. It is built up a line at a time across Tasks 1–5 so that every commit ships a package whose declared entry point exists, and it re-exports every module except `allocateCharacters` — which is exported from `apportion.ts` for its colocated conservation tests but is a mechanism rather than a contract.

---

### Task 1: Package scaffold and excerpt ids

Scaffolding is folded in here because it has nothing to test on its own — this task's deliverable is the first working unit, and the wiring is what lets it run.

**Files:**

- Create: `packages/podcast-engine/package.json`
- Create: `packages/podcast-engine/tsconfig.json`
- Create: `packages/podcast-engine/vitest.config.ts`
- Create: `packages/podcast-engine/src/index.ts`
- Create: `packages/podcast-engine/src/ids.ts`
- Test: `packages/podcast-engine/src/ids.test.ts`

**Interfaces:**

- Consumes: `SourceExcerpt` from `@handbook/content` — `{ documentId: string; url: string; title: string; heading: string; body: string }`.
- Produces: `slugForHeading(heading: string): string` and `deriveExcerptIds(excerpts: readonly SourceExcerpt[]): string[]`. Tasks 4, 5 and 6 use `deriveExcerptIds`. It returns ids positionally aligned with the input array — `ids[i]` is the id of `excerpts[i]`.

- [ ] **Step 1: Create the package scaffold**

`packages/podcast-engine/package.json`:

```json
{
  "name": "@handbook/podcast-engine",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@handbook/content": "workspace:*",
    "@handbook/podcast-providers": "workspace:*",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "22.20.1",
    "typescript": "6.0.3",
    "vitest": "4.1.10"
  }
}
```

`packages/podcast-engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "vitest.config.ts"]
}
```

`packages/podcast-engine/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@handbook/podcast-engine",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Install so the workspace links resolve**

Run: `pnpm install`
Expected: `@handbook/podcast-engine` appears in the workspace; `node_modules/@handbook/content` and `node_modules/@handbook/podcast-providers` symlinks exist inside `packages/podcast-engine/`.

- [ ] **Step 3: Write the failing test**

`packages/podcast-engine/src/ids.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test`
Expected: FAIL — cannot resolve `./ids.ts`.

- [ ] **Step 5: Write the implementation**

`packages/podcast-engine/src/ids.ts`:

```ts
/**
 * Stable, readable ids for the excerpts in one source pack.
 *
 * `SourceExcerpt` has no id, and `(documentId, heading)` is not a key: a
 * document may repeat a heading, and two distinct headings may normalise to
 * the same slug. The identity that actually exists is position — the excerpt's
 * ordered occurrence in the pack. These ids are a readable label for that
 * position, not a claim of natural uniqueness, and they mean nothing against a
 * different pack.
 *
 * One definition, used to render the prompt and to validate what comes back.
 * Two definitions would drift, and the drift would look like the model
 * inventing citations.
 */

import type { SourceExcerpt } from "@handbook/content";

/**
 * NFKC, lowercase, runs of non-letter/non-digit/non-mark to "-", trimmed.
 *
 * `\p{L}`, `\p{N}` and `\p{M}` are Unicode-aware on purpose. Stripping to
 * ASCII would empty every Devanagari and Tamil heading in the corpus and
 * route them all through the ordinal fallback, which reads as a bug in the
 * fallback rather than in the slug. `\p{M}` (combining marks) matters
 * because Devanagari and Tamil compose base letters with dependent vowel
 * signs and viramas that are their own Unicode category — without it, those
 * marks fall into the "non-letter" bucket and every combined syllable gets
 * torn apart.
 */
export function slugForHeading(heading: string): string {
  return heading
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Ids for every excerpt, positionally aligned with the input.
 *
 * Uniqueness is established against the set of ids already issued, not by
 * counting uses of a base. A generated suffix and a natural slug share one
 * namespace: headings `Foo`, `Foo`, `Foo 2` issue `foo-2` for the second
 * `Foo`, and `Foo 2` then slugs naturally to `foo-2`. Per-base counting
 * returns a duplicate for that pack and for its reordering.
 */
export function deriveExcerptIds(excerpts: readonly SourceExcerpt[]): string[] {
  const used = new Set<string>();
  const ordinals = new Map<string, number>();
  const ids: string[] = [];

  for (const excerpt of excerpts) {
    const ordinal = ordinals.get(excerpt.documentId) ?? 0;
    ordinals.set(excerpt.documentId, ordinal + 1);

    const slug = slugForHeading(excerpt.heading);
    const base = `${excerpt.documentId}#${slug === "" ? `section-${ordinal}` : slug}`;

    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    used.add(candidate);
    ids.push(candidate);
  }

  return ids;
}
```

- [ ] **Step 6: Create the public surface**

`package.json` declares `./src/index.ts` as `main`, `types`, and `exports`, so it must exist from
the first commit. Each later task appends its own line; nothing else edits this file.

`packages/podcast-engine/src/index.ts`:

```ts
export * from "./ids.ts";
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @handbook/podcast-engine test`
Expected: PASS, 13 tests (3 in `slugForHeading`, 10 in `deriveExcerptIds`).

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @handbook/podcast-engine check`
Expected: no output, exit 0.

- [ ] **Step 9: Format and commit**

```bash
npx prettier --write packages/podcast-engine
git add packages/podcast-engine pnpm-lock.yaml
git commit -m "feat(engine): scaffold podcast-engine and derive excerpt ids"
```

---

### Task 2: Draft and artifact schemas

**Files:**

- Create: `packages/podcast-engine/src/schema.ts`
- Test: `packages/podcast-engine/src/schema.test.ts`

**Interfaces:**

- Consumes: `SynthesisCost` from `@handbook/podcast-providers` — `{ fixedSeconds: number; marginalRtf: number }`.
- Produces: `DraftPlanSchema` (a `z.ZodType<DraftPlan>`), and the types `DraftBeat`, `DraftPlan`, `PlannedBeat`, `Shortfall`, `SegmentBudget`, `EpisodePlan`. Tasks 3, 4 and 5 all import from here.

- [ ] **Step 1: Write the failing test**

`packages/podcast-engine/src/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DraftPlanSchema } from "./schema.ts";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    title: "Measuring what you cannot see",
    throughLine: "An evaluation set too small to resolve a change reports noise as signal.",
    beats: [{ title: "The setup", intent: "Frame the problem", excerptIds: ["doc#a"], weight: 1 }],
    unsupported: [],
    ...overrides,
  };
}

describe("DraftPlanSchema", () => {
  it("accepts a well-formed draft", () => {
    expect(DraftPlanSchema.safeParse(draft()).success).toBe(true);
  });

  it("rejects a whitespace-only title", () => {
    // min(1) alone accepts "   ", which reaches the artifact as a blank title.
    expect(DraftPlanSchema.safeParse(draft({ title: "   " })).success).toBe(false);
  });

  it("trims the values it accepts", () => {
    const parsed = DraftPlanSchema.parse(draft({ title: "  Padded  " }));

    expect(parsed.title).toBe("Padded");
  });

  it("rejects a beat with no citations", () => {
    // An uncited beat is the failure mode this whole stage exists to prevent.
    const beats = [{ title: "t", intent: "i", excerptIds: [], weight: 1 }];

    expect(DraftPlanSchema.safeParse(draft({ beats })).success).toBe(false);
  });

  it("rejects a draft with no beats", () => {
    expect(DraftPlanSchema.safeParse(draft({ beats: [] })).success).toBe(false);
  });

  it("rejects a non-positive weight", () => {
    for (const weight of [0, -1]) {
      const beats = [{ title: "t", intent: "i", excerptIds: ["doc#a"], weight }];
      expect(DraftPlanSchema.safeParse(draft({ beats })).success).toBe(false);
    }
  });

  it("rejects a whitespace-only excerpt id", () => {
    const beats = [{ title: "t", intent: "i", excerptIds: ["  "], weight: 1 }];

    expect(DraftPlanSchema.safeParse(draft({ beats })).success).toBe(false);
  });

  it("requires unsupported to be present, even when empty", () => {
    const { unsupported: _omitted, ...withoutUnsupported } = draft();

    expect(DraftPlanSchema.safeParse(withoutUnsupported).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/schema.test.ts`
Expected: FAIL — cannot resolve `./schema.ts`.

- [ ] **Step 3: Write the implementation**

`packages/podcast-engine/src/schema.ts`:

```ts
/**
 * What the model answers against, and what the stage produces.
 *
 * These are deliberately different shapes. The draft contains no number except
 * a relative weight and no field code could compute; the artifact contains
 * every computed number. Asked for durations, a model returns values that sum
 * to whatever target it was told, which would make `plannedSeconds` always
 * equal `requestedSeconds` and the shortfall permanently undetectable.
 */

import { z } from "zod";
import type { SynthesisCost } from "@handbook/podcast-providers";

/**
 * `.trim().min(1)` rather than `.min(1)`: the latter accepts a value that is
 * only whitespace, which reaches the artifact as a blank title.
 */
const semanticString = z.string().trim().min(1);

export const DraftBeatSchema = z.object({
  title: semanticString,
  /** What this beat is for — the reason it earns its place in the arc. */
  intent: semanticString,
  /** Ids from the pack. At least one: an uncited beat is the failure mode. */
  excerptIds: z.array(semanticString).min(1),
  /** Relative only. How long this beat should be next to its neighbours. */
  weight: z.number().positive(),
});

export const DraftPlanSchema = z.object({
  title: semanticString,
  /** The argument the episode makes. One sentence, not a topic list. */
  throughLine: semanticString,
  beats: z.array(DraftBeatSchema).min(1),
  /** Arc the model wanted but no excerpt supports. Its own account of the gap. */
  unsupported: z.array(semanticString),
});

export type DraftBeat = z.infer<typeof DraftBeatSchema>;
export type DraftPlan = z.infer<typeof DraftPlanSchema>;

export interface PlannedBeat {
  title: string;
  intent: string;
  excerptIds: string[];
  weight: number;
  /** Computed: min(desired, supportable). Zero is a legitimate outcome. */
  targetSeconds: number;
  /** Computed: this beat's share of the characters it cited. */
  allocatedCharacters: number;
}

export interface Shortfall {
  /** Clamped at zero: floating-point residue must not surface as a negative gap. */
  seconds: number;
  /** Titles of the beats their ceiling bound. Never empty when shortfall is non-null. */
  thinBeats: string[];
}

export interface SegmentBudget {
  maxSegments: number;
  /** The ceiling that was asked for: PlanBudget.maxRenderSeconds, carried through. */
  ceilingSeconds: number;
  /** Projected render at maxSegments. Always <= ceilingSeconds. */
  projectedSeconds: number;
  basis: SynthesisCost;
}

export interface EpisodePlan {
  topic: string;
  title: string;
  throughLine: string;
  beats: PlannedBeat[];
  requestedSeconds: number;
  plannedSeconds: number;
  /** The model's own account of what it could not source. Always present. */
  unsupported: string[];
  /** Null iff no beat was bound by its ceiling. */
  shortfall: Shortfall | null;
  segmentBudget: SegmentBudget;
  /** Carried from the pack, for the freshness check. */
  sourceHash: string;
  /** Carried from the pack: an episode should be able to say what it never saw. */
  droppedForBudget: string[];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @handbook/podcast-engine test src/schema.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Extend the public surface**

Append to `packages/podcast-engine/src/index.ts`, leaving the existing line in place:

```ts
export * from "./schema.ts";
```

- [ ] **Step 6: Typecheck, format and commit**

Vitest transpiles without checking, so it will not catch a strip-types violation or a `strict`
error. Only this does.

```bash
pnpm --filter @handbook/podcast-engine check
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): add the draft and episode plan schemas"
```

---

### Task 3: Budget validation and the segment budget

**Files:**

- Create: `packages/podcast-engine/src/budget.ts`
- Test: `packages/podcast-engine/src/budget.test.ts`

**Interfaces:**

- Consumes: `SynthesisCost` and `projectRenderSeconds(cost, audioSeconds, segments)` from `@handbook/podcast-providers`; `EpisodePlan`, `SegmentBudget` from `./schema.ts`.
- Produces: `PlanBudget` (interface), `assertPlanBudget(budget: PlanBudget): void`, `deriveSegmentBudget(cost: SynthesisCost, plannedSeconds: number, ceilingSeconds: number): SegmentBudget`, `assertWithinBudget(plan: EpisodePlan, segmentCount: number): void`. Tasks 4 and 5 import `PlanBudget`; Task 5 calls `assertPlanBudget` and `deriveSegmentBudget`.

- [ ] **Step 1: Write the failing test**

`packages/podcast-engine/src/budget.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertPlanBudget, assertWithinBudget, deriveSegmentBudget } from "./budget.ts";
import type { PlanBudget } from "./budget.ts";
import type { EpisodePlan } from "./schema.ts";

/** Measured on an M4 in commit 66face3. */
const COST = { fixedSeconds: 3.16, marginalRtf: 0.073 };

function budget(overrides: Partial<PlanBudget> = {}): PlanBudget {
  return {
    requestedSeconds: 2400,
    expansionFactor: 3,
    charsPerSecond: 16.2,
    maxRenderSeconds: 300,
    synthesisCost: COST,
    ...overrides,
  };
}

describe("assertPlanBudget", () => {
  it("accepts a well-formed budget", () => {
    expect(() => assertPlanBudget(budget())).not.toThrow();
  });

  it("rejects a non-positive request, expansion, speech rate or ceiling", () => {
    expect(() => assertPlanBudget(budget({ requestedSeconds: 0 }))).toThrow(/requestedSeconds/);
    expect(() => assertPlanBudget(budget({ expansionFactor: 0 }))).toThrow(/expansionFactor/);
    expect(() => assertPlanBudget(budget({ charsPerSecond: 0 }))).toThrow(/charsPerSecond/);
    expect(() => assertPlanBudget(budget({ maxRenderSeconds: 0 }))).toThrow(/maxRenderSeconds/);
  });

  it("rejects a zero fixed cost, which is the divisor in maxSegments", () => {
    // Left unchecked this yields Infinity segments rather than an error.
    expect(() =>
      assertPlanBudget(budget({ synthesisCost: { fixedSeconds: 0, marginalRtf: 0.073 } })),
    ).toThrow(/fixedSeconds/);
  });

  it("accepts a zero marginal RTF, the one legitimate zero", () => {
    expect(() =>
      assertPlanBudget(budget({ synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0 } })),
    ).not.toThrow();
  });

  it("rejects a negative marginal RTF", () => {
    expect(() =>
      assertPlanBudget(budget({ synthesisCost: { fixedSeconds: 3.16, marginalRtf: -0.1 } })),
    ).toThrow(/marginalRtf/);
  });

  it("rejects non-finite values", () => {
    expect(() => assertPlanBudget(budget({ requestedSeconds: Number.NaN }))).toThrow(/finite/);
    expect(() => assertPlanBudget(budget({ charsPerSecond: Infinity }))).toThrow(/finite/);
  });
});

describe("deriveSegmentBudget", () => {
  it("solves the ceiling for the measured cost", () => {
    // 39 x 3.16 + 0.073 x 2400 = 298.4s; 40 would need 301.6s.
    const solved = deriveSegmentBudget(COST, 2400, 300);

    expect(solved.maxSegments).toBe(39);
    expect(solved.projectedSeconds).toBeCloseTo(298.4, 1);
    expect(solved.ceilingSeconds).toBe(300);
  });

  it("allows more segments on a shorter episode under the same ceiling", () => {
    // Less audio to synthesise leaves more room for per-call overhead.
    const solved = deriveSegmentBudget(COST, 1780, 300);

    expect(solved.maxSegments).toBe(53);
    expect(solved.projectedSeconds).toBeCloseTo(297.4, 1);
  });

  it("stays under the ceiling and would exceed it at one more segment", () => {
    for (const plannedSeconds of [600, 1780, 2400, 3600]) {
      const solved = deriveSegmentBudget(COST, plannedSeconds, 300);

      expect(solved.projectedSeconds).toBeLessThanOrEqual(solved.ceilingSeconds);
      expect(solved.projectedSeconds + COST.fixedSeconds).toBeGreaterThan(solved.ceilingSeconds);
    }
  });

  it("throws when the ceiling is unreachable even as a single call", () => {
    expect(() => deriveSegmentBudget(COST, 2400, 100)).toThrow(/unreachable/);
    expect(() => deriveSegmentBudget(COST, 2400, 100)).toThrow(/178\.4|100/);
  });
});

describe("assertWithinBudget", () => {
  const plan = {
    segmentBudget: { maxSegments: 39, ceilingSeconds: 300, projectedSeconds: 298.4, basis: COST },
  } as EpisodePlan;

  it("accepts a count at the budget", () => {
    expect(() => assertWithinBudget(plan, 39)).not.toThrow();
    expect(() => assertWithinBudget(plan, 1)).not.toThrow();
  });

  it("rejects one past the budget, naming both numbers", () => {
    expect(() => assertWithinBudget(plan, 40)).toThrow(/40/);
    expect(() => assertWithinBudget(plan, 40)).toThrow(/39/);
  });

  it("rejects a non-positive count", () => {
    expect(() => assertWithinBudget(plan, 0)).toThrow(/at least one/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/budget.test.ts`
Expected: FAIL — cannot resolve `./budget.ts`.

- [ ] **Step 3: Write the implementation**

`packages/podcast-engine/src/budget.ts`:

```ts
/**
 * The numbers the planner is given, and the segment budget it derives.
 *
 * `createLocalTts` spawns a process per `synthesise` call, so the fixed cost
 * of loading a model is paid per segment rather than per episode. That makes
 * segment count a priced decision: at the measured 3.16s fixed and 0.073
 * marginal, a 40-minute episode is three minutes of render as one call and
 * nine as a hundred and twenty. This module turns a render-time ceiling into
 * the maximum segment count that fits inside it.
 */

import { projectRenderSeconds } from "@handbook/podcast-providers";
import type { SynthesisCost } from "@handbook/podcast-providers";
import type { EpisodePlan, SegmentBudget } from "./schema.ts";

/**
 * No defaults, and for four different reasons.
 *
 * `charsPerSecond` and `synthesisCost` are measured properties of a voice and
 * a machine. `requestedSeconds` comes from the request. `expansionFactor` is
 * editorial policy. `maxRenderSeconds` is an operational constraint. A default
 * on any of them would be this file answering a question it has no standing to
 * answer -- and `charsPerSecond` defaulting to 14 is exactly the bug that made
 * every reported real-time factor 15% optimistic before commit 66face3.
 */
export interface PlanBudget {
  requestedSeconds: number;
  /** Seconds of dialogue one second of read source sustains. */
  expansionFactor: number;
  /** Measured for your voice. Kokoro af_heart is 16.2. */
  charsPerSecond: number;
  maxRenderSeconds: number;
  /** Straight from bench.ts. */
  synthesisCost: SynthesisCost;
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite, got ${value}`);
  if (value <= 0) throw new Error(`${name} must be greater than zero, got ${value}`);
}

/**
 * Validates before any model call, because each field is divided by or
 * multiplied into a projection. A NaN reaching the artifact makes every number
 * in the plan NaN with no indication of which input was wrong.
 */
export function assertPlanBudget(budget: PlanBudget): void {
  assertPositive("requestedSeconds", budget.requestedSeconds);
  assertPositive("expansionFactor", budget.expansionFactor);
  assertPositive("charsPerSecond", budget.charsPerSecond);
  assertPositive("maxRenderSeconds", budget.maxRenderSeconds);
  // The divisor in maxSegments. Zero here yields Infinity rather than an error.
  assertPositive("synthesisCost.fixedSeconds", budget.synthesisCost.fixedSeconds);

  const marginal = budget.synthesisCost.marginalRtf;
  if (!Number.isFinite(marginal)) {
    throw new Error(`synthesisCost.marginalRtf must be finite, got ${marginal}`);
  }
  // The one legitimate zero: synthesis with no per-second cost is coherent.
  if (marginal < 0) {
    throw new Error(`synthesisCost.marginalRtf must not be negative, got ${marginal}`);
  }
}

/**
 * Inverts `projectRenderSeconds`:
 *
 *   n x fixed + marginal x plannedSeconds <= ceilingSeconds
 */
export function deriveSegmentBudget(
  cost: SynthesisCost,
  plannedSeconds: number,
  ceilingSeconds: number,
): SegmentBudget {
  const maxSegments = Math.floor(
    (ceilingSeconds - cost.marginalRtf * plannedSeconds) / cost.fixedSeconds,
  );

  if (maxSegments < 1) {
    const minimum = projectRenderSeconds(cost, plannedSeconds, 1);
    throw new Error(
      `render ceiling of ${ceilingSeconds}s is unreachable: ${plannedSeconds}s of audio ` +
        `needs at least ${minimum.toFixed(1)}s as a single call`,
    );
  }

  return {
    maxSegments,
    ceilingSeconds,
    projectedSeconds: projectRenderSeconds(cost, plannedSeconds, maxSegments),
    basis: cost,
  };
}

/**
 * The budget's enforcement, living with the number it enforces.
 *
 * The plan sets a maximum and the voice-script stage places the actual cuts,
 * so without this the budget is advice. One definition of the check means the
 * two stages cannot disagree about what the maximum meant.
 */
export function assertWithinBudget(plan: EpisodePlan, segmentCount: number): void {
  if (!Number.isInteger(segmentCount) || segmentCount < 1) {
    throw new Error(`an episode needs at least one segment, got ${segmentCount}`);
  }
  if (segmentCount > plan.segmentBudget.maxSegments) {
    throw new Error(
      `${segmentCount} segments exceeds the plan's budget of ${plan.segmentBudget.maxSegments} ` +
        `(ceiling ${plan.segmentBudget.ceilingSeconds}s at ${plan.segmentBudget.basis.fixedSeconds}s per call)`,
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @handbook/podcast-engine test src/budget.test.ts`
Expected: PASS, 13 tests (6 in `assertPlanBudget`, 4 in `deriveSegmentBudget`, 3 in
`assertWithinBudget`).

- [ ] **Step 5: Extend the public surface**

Append to `packages/podcast-engine/src/index.ts`:

```ts
export * from "./budget.ts";
```

- [ ] **Step 6: Typecheck, format and commit**

```bash
pnpm --filter @handbook/podcast-engine check
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): validate the plan budget and solve the segment budget"
```

---

### Task 4: Apportionment

**Files:**

- Create: `packages/podcast-engine/src/apportion.ts`
- Test: `packages/podcast-engine/src/apportion.test.ts`

**Interfaces:**

- Consumes: `SourceExcerpt` from `@handbook/content`; `PlanBudget` from `./budget.ts`; `DraftPlan`, `PlannedBeat`, `Shortfall` from `./schema.ts`.
- Produces: `allocateCharacters(characters: number, weights: readonly number[]): number[]` and `apportion(draft: DraftPlan, excerpts: readonly SourceExcerpt[], excerptIds: readonly string[], budget: PlanBudget): ApportionResult`, where `ApportionResult` is `{ beats: PlannedBeat[]; plannedSeconds: number; shortfall: Shortfall | null }`. Task 5 calls `apportion`.

- [ ] **Step 1: Write the failing test**

`packages/podcast-engine/src/apportion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SourceExcerpt } from "@handbook/content";
import { allocateCharacters, apportion } from "./apportion.ts";
import type { PlanBudget } from "./budget.ts";
import type { DraftPlan } from "./schema.ts";

function excerpt(documentId: string, heading: string, characters: number): SourceExcerpt {
  return {
    documentId,
    url: `/${documentId}/`,
    title: documentId,
    heading,
    body: "x".repeat(characters),
  };
}

function budget(overrides: Partial<PlanBudget> = {}): PlanBudget {
  return {
    requestedSeconds: 100,
    expansionFactor: 1,
    charsPerSecond: 1,
    maxRenderSeconds: 300,
    synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0.073 },
    ...overrides,
  };
}

function draft(beats: DraftPlan["beats"]): DraftPlan {
  return { title: "T", throughLine: "L", beats, unsupported: [] };
}

describe("allocateCharacters", () => {
  it("splits weight-proportionally", () => {
    expect(allocateCharacters(100, [9, 1])).toEqual([90, 10]);
    expect(allocateCharacters(10, [1, 1])).toEqual([5, 5]);
  });

  it("conserves the exact character count", () => {
    // Every allocation sums to what was handed in -- no multiplication, no loss.
    for (const [characters, weights] of [
      [1, [9, 1]],
      [7, [1, 1, 1]],
      [1000, [3, 5, 7, 11]],
      [3, [1, 1, 1, 1, 1]],
    ] as Array<[number, number[]]>) {
      const allocated = allocateCharacters(characters, weights);

      expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(characters);
      expect(allocated).toHaveLength(weights.length);
    }
  });

  it("gives the remainder to the largest fraction, ties to the earlier beat", () => {
    // Draft order is the tie-break, so allocation is deterministic.
    expect(allocateCharacters(1, [1, 1])).toEqual([1, 0]);
    expect(allocateCharacters(1, [9, 1])).toEqual([1, 0]);
  });

  it("never allocates a negative or fractional share", () => {
    const allocated = allocateCharacters(5, [1, 2, 97]);

    for (const value of allocated) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("apportion", () => {
  it("scales weights into seconds when the source supports it", () => {
    const excerpts = [excerpt("doc", "A", 1000), excerpt("doc", "B", 1000)];
    const ids = ["doc#a", "doc#b"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 3 },
        { title: "Two", intent: "i", excerptIds: ["doc#b"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.beats[0]!.targetSeconds).toBeCloseTo(75, 5);
    expect(result.beats[1]!.targetSeconds).toBeCloseTo(25, 5);
    expect(result.plannedSeconds).toBeCloseTo(100, 5);
    expect(result.shortfall).toBeNull();
  });

  it("clips a beat to what its citations support, and names it", () => {
    // Beat Two wants 10s but its excerpt sustains 5.
    const excerpts = [excerpt("doc", "A", 95), excerpt("doc", "B", 5)];
    const ids = ["doc#a", "doc#b"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 9 },
        { title: "Two", intent: "i", excerptIds: ["doc#b"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.beats[1]!.targetSeconds).toBeCloseTo(5, 5);
    expect(result.plannedSeconds).toBeCloseTo(95, 5);
    expect(result.shortfall).not.toBeNull();
    expect(result.shortfall!.thinBeats).toEqual(["Two"]);
    expect(result.shortfall!.seconds).toBeCloseTo(5, 5);
  });

  it("does not let duplicate citations inside one beat buy duration", () => {
    const excerpts = [excerpt("doc", "A", 50)];
    const ids = ["doc#a"];
    const once = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );
    const twice = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a", "doc#a"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );

    expect(twice.beats[0]!.allocatedCharacters).toBe(once.beats[0]!.allocatedCharacters);
    expect(twice.plannedSeconds).toBeCloseTo(once.plannedSeconds, 10);
  });

  it("shares an excerpt cited by several beats rather than duplicating it", () => {
    // Total allocated never exceeds the union of cited excerpts.
    const excerpts = [excerpt("doc", "A", 100)];
    const ids = ["doc#a"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 },
        { title: "Two", intent: "i", excerptIds: ["doc#a"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    const allocated = result.beats.reduce((sum, beat) => sum + beat.allocatedCharacters, 0);
    expect(allocated).toBe(100);
  });

  it("never plans past the request or past the evidence", () => {
    const excerpts = [excerpt("doc", "A", 40), excerpt("doc", "B", 20)];
    const ids = ["doc#a", "doc#b"];
    const result = apportion(
      draft([
        { title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 },
        { title: "Two", intent: "i", excerptIds: ["doc#b"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget({ requestedSeconds: 1000 }),
    );

    const capacity = (1 * 60) / 1; // expansionFactor x unionChars / charsPerSecond
    expect(result.plannedSeconds).toBeLessThanOrEqual(1000);
    expect(result.plannedSeconds).toBeLessThanOrEqual(capacity);
  });

  it("allocates nothing from an excerpt no beat cites", () => {
    // Capacity is the union of *cited* excerpts. An uncited excerpt sitting in
    // the pack must not quietly raise plannedSeconds -- the beat is bound by
    // what it drew on, not by what was available.
    const excerpts = [excerpt("doc", "A", 50), excerpt("doc", "B", 1000)];
    const ids = ["doc#a", "doc#b"];
    const result = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.beats[0]!.allocatedCharacters).toBe(50);
    expect(result.plannedSeconds).toBeCloseTo(50, 5);
    expect(result.shortfall!.thinBeats).toEqual(["One"]);
  });

  it("keeps a zero-allocation beat rather than dropping or flooring it", () => {
    // A single character shared 9:1 allocates 1 and 0.
    const excerpts = [excerpt("doc", "A", 1)];
    const ids = ["doc#a"];
    const result = apportion(
      draft([
        { title: "Heavy", intent: "i", excerptIds: ["doc#a"], weight: 9 },
        { title: "Light", intent: "i", excerptIds: ["doc#a"], weight: 1 },
      ]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.beats).toHaveLength(2);
    expect(result.beats[1]!.allocatedCharacters).toBe(0);
    expect(result.beats[1]!.targetSeconds).toBe(0);
    expect(result.shortfall!.thinBeats).toContain("Light");
  });

  it("throws when every beat allocates zero", () => {
    // plannedSeconds of 0 cannot become an episode; the only honest reading is
    // that nothing is sourceable.
    const excerpts = [excerpt("doc", "A", 0)];
    const ids = ["doc#a"];

    expect(() =>
      apportion(
        draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
        excerpts,
        ids,
        budget(),
      ),
    ).toThrow(/no beat has any supporting text/);
  });

  it("reports a non-negative shortfall", () => {
    const excerpts = [excerpt("doc", "A", 1000)];
    const ids = ["doc#a"];
    const result = apportion(
      draft([{ title: "One", intent: "i", excerptIds: ["doc#a"], weight: 1 }]),
      excerpts,
      ids,
      budget(),
    );

    expect(result.shortfall?.seconds ?? 0).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/apportion.test.ts`
Expected: FAIL — cannot resolve `./apportion.ts`.

- [ ] **Step 3: Write the implementation**

`packages/podcast-engine/src/apportion.ts`:

```ts
/**
 * Turning relative weights into seconds, bounded by the cited source.
 *
 * Weight says the shape the model wants. Cited material says what it can
 * sustain. `target = min(desired, supportable)`, and the shortfall is what
 * falls out -- not a separate mechanism bolted on.
 *
 * Each excerpt's characters are shared weight-proportionally among the beats
 * citing it. Two beats drawing on one passage are sharing material, not making
 * more of it; without the split, citing everything everywhere would inflate
 * `plannedSeconds` past what the pack holds.
 */

import type { SourceExcerpt } from "@handbook/content";
import type { PlanBudget } from "./budget.ts";
import type { DraftPlan, PlannedBeat, Shortfall } from "./schema.ts";

export interface ApportionResult {
  beats: PlannedBeat[];
  plannedSeconds: number;
  shortfall: Shortfall | null;
}

/**
 * Splits `characters` across `weights` as integers summing to exactly
 * `characters`, by largest remainder.
 *
 * Integer rather than fractional so conservation is exact and testable with
 * `toBe`, and two runs over one draft produce identical plans. Ties in the
 * remainder go to the earlier beat in draft order, which is stable for a given
 * draft and needs no secondary key.
 */
export function allocateCharacters(characters: number, weights: readonly number[]): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0 || characters <= 0) return weights.map(() => 0);

  const exact = weights.map((weight) => (characters * weight) / totalWeight);
  const allocated = exact.map((value) => Math.floor(value));
  let remaining = characters - allocated.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    allocated[index] = (allocated[index] ?? 0) + 1;
    remaining -= 1;
  }

  return allocated;
}

export function apportion(
  draft: DraftPlan,
  excerpts: readonly SourceExcerpt[],
  excerptIds: readonly string[],
  budget: PlanBudget,
): ApportionResult {
  // Deduped per beat: citing one excerpt twice does not change what the beat
  // is grounded in, and must not change what it is allowed to say.
  const citations = draft.beats.map((beat) => new Set(beat.excerptIds));
  const allocatedCharacters = draft.beats.map(() => 0);

  excerptIds.forEach((id, position) => {
    const characters = excerpts[position]?.body.length ?? 0;
    const citing: number[] = [];
    citations.forEach((cited, beatIndex) => {
      if (cited.has(id)) citing.push(beatIndex);
    });
    if (citing.length === 0 || characters === 0) return;

    const shares = allocateCharacters(
      characters,
      citing.map((beatIndex) => draft.beats[beatIndex]!.weight),
    );
    citing.forEach((beatIndex, shareIndex) => {
      allocatedCharacters[beatIndex] =
        (allocatedCharacters[beatIndex] ?? 0) + (shares[shareIndex] ?? 0);
    });
  });

  const totalWeight = draft.beats.reduce((sum, beat) => sum + beat.weight, 0);
  const thinBeats: string[] = [];

  const beats: PlannedBeat[] = draft.beats.map((beat, index) => {
    const allocated = allocatedCharacters[index] ?? 0;
    const desired = (budget.requestedSeconds * beat.weight) / totalWeight;
    const supportable = (budget.expansionFactor * allocated) / budget.charsPerSecond;
    // Thin only on a material clip. `desired` and `supportable` come from two
    // unrelated float paths, so a raw `<` flags a beat that was never clipped
    // when the two are mathematically equal.
    if (desired - supportable > desired * 1e-9) thinBeats.push(beat.title);

    return {
      title: beat.title,
      intent: beat.intent,
      excerptIds: [...citations[index]!],
      weight: beat.weight,
      targetSeconds: Math.min(desired, supportable),
      allocatedCharacters: allocated,
    };
  });

  // Clamped: summing float targetSeconds can overshoot requestedSeconds by a
  // few ULPs even when nothing was clipped, which would make the documented
  // `plannedSeconds <= requestedSeconds` invariant literally false.
  const plannedSeconds = Math.min(
    beats.reduce((sum, beat) => sum + beat.targetSeconds, 0),
    budget.requestedSeconds,
  );

  if (plannedSeconds <= 0) {
    throw new Error(
      "no beat has any supporting text: every beat allocated zero characters, so the plan " +
        "cannot become an episode",
    );
  }

  // Null iff no beat was clipped. Deliberately not `plannedSeconds ===
  // requestedSeconds`, which is a floating-point equality test -- the hazard
  // integer allocation was chosen to avoid. Whether a beat was clipped is a
  // boolean fact about the min().
  const shortfall: Shortfall | null =
    thinBeats.length === 0
      ? null
      : {
          seconds: Math.max(0, budget.requestedSeconds - plannedSeconds),
          thinBeats,
        };

  return { beats, plannedSeconds, shortfall };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @handbook/podcast-engine test src/apportion.test.ts`
Expected: PASS, 13 tests (4 in `allocateCharacters`, 9 in `apportion`).

- [ ] **Step 5: Extend the public surface, deliberately narrowly**

Append to `packages/podcast-engine/src/index.ts`. Named exports rather than `export *`, because
`allocateCharacters` is exported from `apportion.ts` so its conservation invariant is directly
testable — it is a mechanism, not a contract, and must not reach the package surface:

```ts
export { apportion } from "./apportion.ts";
export type { ApportionResult } from "./apportion.ts";
```

- [ ] **Step 6: Typecheck, format and commit**

```bash
pnpm --filter @handbook/podcast-engine check
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): apportion cited characters into beat durations"
```

---

### Task 5: planEpisode

**Files:**

- Create: `packages/podcast-engine/src/plan.ts`
- Test: `packages/podcast-engine/src/plan.test.ts`

**Interfaces:**

- Consumes: `SourcePack` from `@handbook/content`; `LlmPort`, `Usage` from `@handbook/podcast-providers`; everything produced by Tasks 1–4.
- Produces: `planEpisode(pack: SourcePack, budget: PlanBudget, llm: LlmPort): Promise<PlanResult>`, where `PlanResult` is `{ plan: EpisodePlan; usage: Usage; modelId: string }`. Task 6 calls it.

- [ ] **Step 1: Write the failing test**

`packages/podcast-engine/src/plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FakeLlm } from "@handbook/podcast-providers";
import type { SourcePack } from "@handbook/content";
import { planEpisode } from "./plan.ts";
import type { PlanBudget } from "./budget.ts";

function pack(sections: Array<[string, number]>): SourcePack {
  return {
    topic: "Evaluation",
    primary: {
      documentId: "doc",
      url: "/doc/",
      sourcePath: "doc.mdx",
      title: "Doc",
      version: "1.0.0",
      lastUpdated: "2026-08-16",
    },
    related: [],
    excerpts: sections.map(([heading, characters]) => ({
      documentId: "doc",
      url: "/doc/",
      title: "Doc",
      heading,
      body: "x".repeat(characters),
    })),
    sourceHash: "hash-abc",
    estimatedTokens: 100,
    droppedForBudget: ["lab:semantic-cache"],
  };
}

function budget(overrides: Partial<PlanBudget> = {}): PlanBudget {
  return {
    requestedSeconds: 100,
    expansionFactor: 1,
    charsPerSecond: 1,
    maxRenderSeconds: 300,
    synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0.073 },
    ...overrides,
  };
}

const goodDraft = {
  title: "Measuring what you cannot see",
  throughLine: "A small evaluation set reports noise as signal.",
  beats: [
    { title: "Setup", intent: "Frame it", excerptIds: ["doc#alpha"], weight: 1 },
    { title: "Payoff", intent: "Land it", excerptIds: ["doc#beta"], weight: 1 },
  ],
  unsupported: [],
};

describe("planEpisode", () => {
  it("produces a plan and carries the pack's provenance forward", async () => {
    const llm = new FakeLlm([goodDraft]);

    const { plan, modelId, usage } = await planEpisode(
      pack([
        ["Alpha", 200],
        ["Beta", 200],
      ]),
      budget(),
      llm,
    );

    expect(plan.title).toBe("Measuring what you cannot see");
    expect(plan.beats).toHaveLength(2);
    expect(plan.sourceHash).toBe("hash-abc");
    expect(plan.droppedForBudget).toEqual(["lab:semantic-cache"]);
    expect(plan.segmentBudget.maxSegments).toBeGreaterThan(0);
    expect(modelId).toBe("fake-llm");
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  it("puts every derived id in the prompt so the model can cite them", async () => {
    const llm = new FakeLlm([goodDraft]);

    await planEpisode(
      pack([
        ["Alpha", 200],
        ["Beta", 200],
      ]),
      budget(),
      llm,
    );

    expect(llm.calls[0]!.prompt).toContain("doc#alpha");
    expect(llm.calls[0]!.prompt).toContain("doc#beta");
  });

  it("rejects a citation that is not in the pack, naming it", async () => {
    // Zod validates shape; shape cannot tell a real id from a plausible one.
    const llm = new FakeLlm([
      {
        ...goodDraft,
        beats: [{ title: "Setup", intent: "i", excerptIds: ["doc#invented"], weight: 1 }],
      },
    ]);

    await expect(planEpisode(pack([["Alpha", 200]]), budget(), llm)).rejects.toThrow(
      /doc#invented/,
    );
  });

  it("refuses an empty pack without calling the model", async () => {
    const llm = new FakeLlm([goodDraft]);

    await expect(planEpisode(pack([]), budget(), llm)).rejects.toThrow(/no excerpts/);
    expect(llm.calls).toHaveLength(0);
  });

  it("refuses a pack whose excerpts are all empty without calling the model", async () => {
    const llm = new FakeLlm([goodDraft]);

    await expect(planEpisode(pack([["Alpha", 0]]), budget(), llm)).rejects.toThrow(/no excerpts/);
    expect(llm.calls).toHaveLength(0);
  });

  // Every one of the six numeric requirements must reject before the model is
  // called. Task 3's tests prove the validation logic; only this proves the
  // ordering, and ordering is the whole point of validating up front.
  it.each([
    ["requestedSeconds", { requestedSeconds: 0 }],
    ["expansionFactor", { expansionFactor: 0 }],
    ["charsPerSecond", { charsPerSecond: 0 }],
    ["maxRenderSeconds", { maxRenderSeconds: 0 }],
    ["fixedSeconds", { synthesisCost: { fixedSeconds: 0, marginalRtf: 0.073 } }],
    ["marginalRtf", { synthesisCost: { fixedSeconds: 3.16, marginalRtf: -0.1 } }],
  ] as Array<[string, Partial<PlanBudget>]>)(
    "refuses an invalid %s without calling the model",
    async (field, override) => {
      const llm = new FakeLlm([goodDraft]);

      await expect(planEpisode(pack([["Alpha", 200]]), budget(override), llm)).rejects.toThrow(
        field,
      );
      expect(llm.calls).toHaveLength(0);
    },
  );

  it("keeps the model's reported gaps visible when the computed shortfall is null", async () => {
    // The two are independent channels. A naive implementation drops one
    // because the other looks clean.
    const llm = new FakeLlm([
      { ...goodDraft, unsupported: ["nothing covers rollout or failure modes"] },
    ]);

    const { plan } = await planEpisode(
      pack([
        ["Alpha", 500],
        ["Beta", 500],
      ]),
      budget(),
      llm,
    );

    expect(plan.shortfall).toBeNull();
    expect(plan.unsupported).toEqual(["nothing covers rollout or failure modes"]);
  });

  it("records a shortfall when the pack cannot support the request", async () => {
    const llm = new FakeLlm([goodDraft]);

    const { plan } = await planEpisode(
      pack([
        ["Alpha", 95],
        ["Beta", 5],
      ]),
      budget(),
      llm,
    );

    expect(plan.plannedSeconds).toBeLessThan(plan.requestedSeconds);
    expect(plan.shortfall).not.toBeNull();
    expect(plan.shortfall!.thinBeats.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/plan.test.ts`
Expected: FAIL — cannot resolve `./plan.ts`.

- [ ] **Step 3: Write the implementation**

`packages/podcast-engine/src/plan.ts`:

```ts
/**
 * The plan stage: a source pack in, a validated episode plan out.
 *
 * One model call, and it is asked only for judgment -- the arc, the citations,
 * and how long each beat should be relative to its neighbours. That relative
 * weight is the one number the model supplies and the artifact keeps; every
 * absolute or operational number is computed here afterwards. A model asked to
 * apportion a time budget under-cites, and the citations are the half the
 * groundedness gate reads.
 */

import type { SourcePack } from "@handbook/content";
import type { LlmPort, Usage } from "@handbook/podcast-providers";
import { apportion } from "./apportion.ts";
import { assertPlanBudget, deriveSegmentBudget } from "./budget.ts";
import type { PlanBudget } from "./budget.ts";
import { deriveExcerptIds } from "./ids.ts";
import { DraftPlanSchema } from "./schema.ts";
import type { DraftPlan, EpisodePlan } from "./schema.ts";

export interface PlanResult {
  plan: EpisodePlan;
  usage: Usage;
  modelId: string;
}

const SYSTEM = [
  "You plan podcast episodes from a closed set of source excerpts.",
  "You may only discuss what the excerpts contain. If the arc you want is not",
  "supported by an excerpt, put it in `unsupported` rather than writing a beat",
  "for it.",
  "Every beat must cite at least one excerpt id, copied exactly from the list.",
  "`weight` is relative only -- how long a beat should be next to its",
  "neighbours. Do not attempt to make weights sum to anything in particular,",
  "and do not estimate durations.",
].join(" ");

export function renderPrompt(pack: SourcePack, excerptIds: readonly string[]): string {
  const lines = [
    `Topic: ${pack.topic}`,
    `Primary source: ${pack.primary.title} (${pack.primary.url})`,
    "",
    "Excerpts, each with the id you must cite it by:",
    "",
  ];

  excerptIds.forEach((id, position) => {
    const excerpt = pack.excerpts[position];
    if (!excerpt) return;
    lines.push(`[${id}] ${excerpt.title} — ${excerpt.heading}`, excerpt.body, "");
  });

  lines.push("Plan an episode from these excerpts and nothing else.");
  return lines.join("\n");
}

/**
 * Shape validation cannot tell a real excerpt id from a plausible one, so this
 * runs after it. Names the invented ids and how many valid ones existed --
 * following `gatewayBaseUrl`, which rejects an unknown provider up front
 * rather than 404ing at call time. Not the full list: a pack can hold hundreds
 * and a wall of ids is not actionable.
 */
export function validateCitations(draft: DraftPlan, excerptIds: readonly string[]): void {
  const known = new Set(excerptIds);
  const invented = new Set<string>();

  for (const beat of draft.beats) {
    for (const id of beat.excerptIds) {
      if (!known.has(id)) invented.add(id);
    }
  }

  if (invented.size > 0) {
    throw new Error(
      `the plan cites ${invented.size} excerpt id(s) that are not in the pack: ` +
        `${[...invented].join(", ")} (the pack has ${excerptIds.length})`,
    );
  }
}

export async function planEpisode(
  pack: SourcePack,
  budget: PlanBudget,
  llm: LlmPort,
): Promise<PlanResult> {
  // Both refusals precede the model call. The pack is the only input, and a
  // plan built from nothing is built from the model's memory of the topic --
  // which is what the closed-set rule exists to prevent.
  assertPlanBudget(budget);
  if (pack.excerpts.every((excerpt) => excerpt.body.length === 0)) {
    throw new Error(`source pack for "${pack.topic}" has no excerpts with any text`);
  }

  const excerptIds = deriveExcerptIds(pack.excerpts);

  const result = await llm.generate<DraftPlan>({
    schema: DraftPlanSchema,
    system: SYSTEM,
    prompt: renderPrompt(pack, excerptIds),
  });

  validateCitations(result.value, excerptIds);

  const { beats, plannedSeconds, shortfall } = apportion(
    result.value,
    pack.excerpts,
    excerptIds,
    budget,
  );

  const plan: EpisodePlan = {
    topic: pack.topic,
    title: result.value.title,
    throughLine: result.value.throughLine,
    beats,
    requestedSeconds: budget.requestedSeconds,
    plannedSeconds,
    unsupported: result.value.unsupported,
    shortfall,
    segmentBudget: deriveSegmentBudget(
      budget.synthesisCost,
      plannedSeconds,
      budget.maxRenderSeconds,
    ),
    sourceHash: pack.sourceHash,
    droppedForBudget: pack.droppedForBudget,
  };

  // No UsageLedger here on purpose: the pipeline records the stage. A stage
  // that writes to a ledger it was handed cannot be called twice in a test
  // without inventing one.
  return { plan, usage: result.usage, modelId: result.modelId };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @handbook/podcast-engine test src/plan.test.ts`
Expected: PASS, 13 tests (the budget refusal is parameterised over all six fields).

- [ ] **Step 5: Extend the public surface**

Append to `packages/podcast-engine/src/index.ts`:

```ts
export * from "./plan.ts";
```

- [ ] **Step 6: Typecheck, format and commit**

```bash
pnpm --filter @handbook/podcast-engine check
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): plan an episode from a source pack"
```

---

### Task 6: Live-corpus test, public surface, README

**Files:**

- Create: `packages/podcast-engine/src/corpus.test.ts`
- Verify: `packages/podcast-engine/src/index.ts` (built up across Tasks 1–5; this task confirms
  its final shape rather than writing it)
- Create: `packages/podcast-engine/README.md`

**Interfaces:**

- Consumes: `loadAllDocuments(repoRoot: string): Promise<Map<string, HandbookDocument>>` and `buildSourcePack(documents, primaryId, options?)` from `@handbook/content`; everything from Tasks 1–5.
- Produces: no new module. It confirms the public surface that Tasks 1–5 built, and the package README.

- [ ] **Step 1: Write the characterisation test**

Unlike every other task, this test is not expected to fail first — see Step 2.

`packages/podcast-engine/src/corpus.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSourcePack, loadAllDocuments } from "@handbook/content";
import { FakeLlm } from "@handbook/podcast-providers";
import { deriveExcerptIds } from "./ids.ts";
import { planEpisode } from "./plan.ts";

// Fixtures do not contain duplicate headings, punctuation-only headings, or
// non-ASCII. Real pages do, and that is the class of bug id derivation has.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("against the live content tree", () => {
  it("derives globally unique ids for every pack in the corpus", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);

    for (const id of documents.keys()) {
      const pack = buildSourcePack(documents, id);
      const ids = deriveExcerptIds(pack.excerpts);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((value) => value.length > 0)).toBe(true);
    }
  });

  it("plans an episode from a real pack", async () => {
    const documents = await loadAllDocuments(REPO_ROOT);
    const pack = buildSourcePack(documents, "module:06-mcp");
    const ids = deriveExcerptIds(pack.excerpts);
    expect(ids.length).toBeGreaterThan(1);

    const llm = new FakeLlm([
      {
        title: "What MCP actually standardises",
        throughLine: "MCP is a transport contract, not a capability.",
        beats: [
          { title: "Open", intent: "Frame it", excerptIds: [ids[0]], weight: 2 },
          { title: "Close", intent: "Land it", excerptIds: [ids[1]], weight: 1 },
        ],
        unsupported: [],
      },
    ]);

    const { plan } = await planEpisode(
      pack,
      {
        requestedSeconds: 2400,
        expansionFactor: 3,
        charsPerSecond: 16.2,
        maxRenderSeconds: 300,
        synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0.073 },
      },
      llm,
    );

    expect(plan.sourceHash).toBe(pack.sourceHash);
    expect(plan.plannedSeconds).toBeGreaterThan(0);
    expect(plan.plannedSeconds).toBeLessThanOrEqual(2400);
    expect(plan.segmentBudget.projectedSeconds).toBeLessThanOrEqual(300);
  });
});
```

- [ ] **Step 2: Run the characterisation test**

**This one is not a red-then-green step, and pretending otherwise would be a lie about what it
does.** Every unit it exercises already exists and passes; Task 1 installed the workspace, so
`@handbook/content` resolves. It is an integration and characterisation test: it asks whether the
implementation survives contact with real headings, which fixtures cannot supply.

Run: `pnpm --filter @handbook/podcast-engine test src/corpus.test.ts`
Expected: **PASS.**

A failure here is a real defect, not a step working as designed. In particular a duplicate id means
`ids.ts` is wrong against the actual corpus — fix `ids.ts` and add the offending headings to
`ids.test.ts` as a unit case. Do not relax the assertion.

- [ ] **Step 3: Confirm the public surface**

`src/index.ts` was created in Task 1 and appended to by Tasks 2–5. Read it and confirm it matches
this exactly, adding the explanatory comment if it is not already there:

```ts
export * from "./ids.ts";
export * from "./schema.ts";
export * from "./budget.ts";

// Named rather than `export *`: `allocateCharacters` is exported from
// apportion.ts so its conservation invariant is directly testable, but it is a
// mechanism rather than a contract and does not belong on the package surface.
export { apportion } from "./apportion.ts";
export type { ApportionResult } from "./apportion.ts";

export * from "./plan.ts";
```

Then prove the narrowing holds rather than trusting the file. Run:

The `pnpm --filter ... exec` prefix is required, not decoration: the repository root does not link
workspace packages into its own `node_modules`, so the same command run from the root fails with
`ERR_MODULE_NOT_FOUND` before it can check anything.

```bash
pnpm --filter @handbook/podcast-engine exec node --experimental-strip-types -e 'import("@handbook/podcast-engine").then((m) => {
  if ("allocateCharacters" in m) throw new Error("allocateCharacters leaked onto the package surface");
  for (const name of ["planEpisode", "apportion", "deriveExcerptIds", "assertWithinBudget", "DraftPlanSchema"]) {
    if (!(name in m)) throw new Error(`${name} is missing from the package surface`);
  }
  console.error("surface ok");
})'
```

Expected: `surface ok`. A thrown error here is the real failure mode — `export *` added by habit in
a later edit would silently republish the mechanism.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @handbook/podcast-engine test`
Expected: PASS, all files.

- [ ] **Step 5: Write the README**

`packages/podcast-engine/README.md`:

````markdown
# @handbook/podcast-engine

The podcast pipeline's stages. `plan` is the only one implemented.

The design is [the episode planner spec](../../docs/superpowers/specs/2026-08-16-episode-planner-design.md);
the orchestration decision is [ADR-0008](https://handbook.vinodspattar.in/adr/decisions/0008-typescript-podcast-pipeline/).

## The split that matters

The model returns judgment, plus one relative number. TypeScript returns every number that means
anything on its own.

```text
llm.generate(DraftPlan)   ordered beats, citations, relative weights
      |
validateCitations         an id not in the pack throws, naming it
apportion                 weights -> seconds, bounded by cited characters
deriveSegmentBudget       render ceiling -> maxSegments
      |
EpisodePlan
```

Ask a model for durations and it returns numbers that sum to whatever target you gave it, which
would make `plannedSeconds` always equal `requestedSeconds` and a shortfall impossible to detect.
Relative weights it can judge; the absolute scale comes from the source.

## Two things it refuses to do

**It will not pad.** A pack that supports 1,780 seconds produces a 1,780-second plan, with the gap
in `shortfall` and the starved beats named in `thinBeats`. An episode short of its target is a fine
artifact; one padded to target with invented material is the kind that looks shippable.

**It will not trust a citation.** Zod validates the shape of what comes back, but shape cannot tell
a real excerpt id from a plausible one. Ids are derived from the pack and checked against it.

## Segment count is priced, not chosen

`createLocalTts` spawns a process per `synthesise` call, so model load is paid per segment. At the
measured 3.16s fixed and 0.073 marginal, a 40-minute episode renders in 3.0 minutes as one call and
9.3 as 120. `maxSegments` falls out of inverting `projectRenderSeconds` against a render ceiling —
39 segments for a 40-minute episode under five minutes of render. `assertWithinBudget` is how the
voice-script stage proves it honoured that.

## Verify it

```bash
pnpm --filter @handbook/podcast-engine test
pnpm --filter @handbook/podcast-engine check
```

No network. `FakeLlm` validates every queued response against the caller's real schema, so a test
cannot prove the pipeline works on data the schema would reject. One suite runs against the live
content tree rather than fixtures, because duplicate headings and non-ASCII exist in real pages.
````

- [ ] **Step 6: Run the full gate**

Run: `pnpm verify`
Expected: exit 0, and **184 tests** — the 122 baseline plus 62 added by this plan (13 ids, 8 schema,
13 budget, 13 apportion, 13 plan, 2 corpus). The count is deterministic, so any other number means a
task was skipped, a test was dropped, or a suite was double-counted. Reconcile it before committing
rather than accepting a green run at the wrong total.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): test id derivation against the live corpus and document the stage"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: outline-plus-budget → Tasks 3 and 5; plan-short-and-record → Task 4; package placement → Task 1; judgment/arithmetic split → Task 5; excerpt ids including all four collision cases → Task 1; draft-vs-artifact schema with top-level `unsupported` → Task 2; apportionment with weight-proportional sharing and largest-remainder integer allocation → Task 4; segment budget inversion and `assertWithinBudget` → Task 3; numeric boundaries and the clamped shortfall → Tasks 3 and 4; error handling including both zero-call refusals → Task 5; live-corpus testing → Task 6.

**Invariants.** All six from the spec are covered: (1) duplicate citations, (2) conservation, (3) no multiplication, (4) the double bound — Task 4; (5) empty pack causing zero `FakeLlm` calls, (6) `unsupported` visible when `shortfall` is null — Task 5.

**Pre-call refusal is proved per field, not once.** The spec requires each of the six numeric requirements to reject before the model is invoked. Task 3's tests establish the validation logic but cannot establish ordering; Task 5's parameterised case asserts zero `FakeLlm` calls for all six, which is the only place ordering is actually pinned.

**Two spec properties that needed their own tests, now present.** Id derivation is stable across repeated derivations from one pack while a reordered pack may legitimately change ids — Task 1, and it is what makes "ids are pack-relative" a tested claim rather than a comment. An excerpt no beat cites allocates zero and cannot raise `plannedSeconds` — Task 4, which is what makes capacity the union of _cited_ excerpts rather than of the pack.

**Known gap, deliberate.** The spec's open note says `thinBeats` reflects the citation assignment the model submitted, not semantic support. Nothing in this plan tests semantic relevance, because nothing here can: that is the review stage's job and it does not exist yet.

**Type consistency.** `deriveExcerptIds` returns `string[]` aligned with `pack.excerpts` and is consumed that way in Tasks 4, 5, 6. `PlanBudget` is defined once in Task 3 and imported by Tasks 4 and 5. `SegmentBudget` is defined in Task 2 and constructed only in Task 3. `apportion` returns `{ beats, plannedSeconds, shortfall }` and Task 5 destructures exactly those three.
