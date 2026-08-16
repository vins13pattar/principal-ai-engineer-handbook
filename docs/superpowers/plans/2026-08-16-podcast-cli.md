# Podcast CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the operator entry point for the podcast pipeline — a `plan` command that talks to a real model and a `create` command that honestly refuses.

**Architecture:** A CLI at `packages/podcast-engine/src/cli.ts` composed from small, separately tested modules: strict config loading, a shared request builder, a cost estimator, an atomic run lifecycle, and a validated manifest. Two already-merged packages change: `@handbook/podcast-providers` gains a provider-neutral error so schema failures can be diagnosed without importing `ai` downstream, and `@handbook/podcast-engine`'s `planEpisode` takes a token bound it previously advertised but never enforced.

**Tech Stack:** TypeScript under `node --experimental-strip-types`, Zod 4 for config and manifest validation, Vitest 4, pnpm workspaces.

**Spec:** [docs/superpowers/specs/2026-08-16-podcast-cli-design.md](../specs/2026-08-16-podcast-cli-design.md) at commit `1108354`. The spec is the authority; where this plan and the spec disagree, the spec wins and the plan is wrong.

## Global Constraints

- **Runtime is `node --experimental-strip-types`.** Types are erased, not transformed. No parameter properties (`constructor(private readonly x)`), no `enum`, no namespaces. Vitest transpiles and will not catch these — only `pnpm check` will.
- **Relative imports carry the `.ts` extension** (`./config.ts`).
- **`verbatimModuleSyntax`:** type-only imports must use `import type`.
- **`noUncheckedIndexedAccess`:** `array[i]` is `T | undefined`.
- **`exactOptionalPropertyTypes`:** you cannot assign `undefined` to an optional property. Declare fields that may be absent as `T | undefined`, or omit the key entirely via a conditional spread.
- **`@handbook/podcast-engine` must never import `ai` or any `@ai-sdk/*` package.** This is the constraint that forces Task 1 to exist.
- **No network in any test.** `FakeLlm` is the only model. The single live-provider smoke test is opt-in and outside the suite.
- **`no-console`** is a lint warning; only `cli.ts` may print, via the exemption added in Task 7.
- **Run `npx prettier --write` on touched paths before committing** — `format:check` is part of the gate.
- **Measured baseline:** `pnpm verify` exit 0, **190 tests** across 16 files, 29 lint warnings, 0 errors. `@handbook/podcast-engine` has 68; `@handbook/podcast-providers` has 59.

## File Structure

```text
packages/podcast-providers/src/
  errors.ts          NEW   ModelResponseError — the only error shape that crosses the boundary
  errors.test.ts     NEW
  ai-sdk.ts          MOD   translate NoObjectGeneratedError at the one layer allowed to know it
  index.ts           MOD   export ./errors.ts

packages/podcast-engine/src/
  plan.ts            MOD   buildPlanRequest; planEpisode takes the token bound
  plan.test.ts       MOD   9 planEpisode call sites + new assertions
  corpus.test.ts     MOD   1 planEpisode call site
  config.ts          NEW   strict Zod config, no filesystem access
  config.test.ts     NEW
  run.ts             NEW   sanitisation, run ids, atomic reservation
  run.test.ts        NEW
  manifest.ts        NEW   discriminated union on status, validated before write
  manifest.test.ts   NEW
  estimate.ts        NEW   the scoped cost breakdown
  estimate.test.ts   NEW
  cli.ts             NEW   argv, wiring, output, diagnostics
  cli.test.ts        NEW
  index.ts           MOD   export config, run, manifest, estimate

podcast.config.example.json   NEW
.gitignore                    MOD   podcast.config.json, .podcast/
eslint.config.js              MOD   console allowance for **/src/cli.ts
```

**On test counts.** Unlike the previous plan, this one does not pin an exact final total up front — several tasks specify required assertions rather than complete test bodies, so a number stated now would be a guess. Instead: **each task's verification step records its own count**, and Task 7's gate reconciles `190 + the sum of those recorded numbers`. A mismatch there means a task was skipped or a test was dropped. Do not accept a green run at an unreconciled total.

---

### Task 1: ModelResponseError and the provider translation

**Files:**

- Create: `packages/podcast-providers/src/errors.ts`
- Test: `packages/podcast-providers/src/errors.test.ts`
- Modify: `packages/podcast-providers/src/ai-sdk.ts`
- Modify: `packages/podcast-providers/src/index.ts`

**Interfaces:**

- Consumes: `Usage` from `./ports.ts` — `{ inputTokens: number; outputTokens: number; speechCharacters: number }`.
- Produces: `ModelResponseError` with readonly `rawText`, `usage`, `finishReason`, each `T | undefined`. Task 7 catches it to write `failure.json`.

**Why this exists:** `@handbook/podcast-engine` may not import `ai`, so nothing downstream can legally recognise `NoObjectGeneratedError` or read its `.text`. Without translation here, the single most likely first-contact failure — a model returning prose instead of schema-valid JSON — is undiagnosable.

- [ ] **Step 1: Write the failing test**

`packages/podcast-providers/src/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ModelResponseError } from "./errors.ts";

describe("ModelResponseError", () => {
  it("carries the approved diagnostic fields", () => {
    const error = new ModelResponseError("model returned no object", {
      rawText: "I'd be happy to help!",
      usage: { inputTokens: 100, outputTokens: 20, speechCharacters: 0 },
      finishReason: "stop",
    });

    expect(error.rawText).toBe("I'd be happy to help!");
    expect(error.usage?.inputTokens).toBe(100);
    expect(error.finishReason).toBe("stop");
    expect(error.name).toBe("ModelResponseError");
    expect(error).toBeInstanceOf(Error);
  });

  it("leaves every field undefined when the provider supplied none", () => {
    const error = new ModelResponseError("model returned no object");

    expect(error.rawText).toBeUndefined();
    expect(error.usage).toBeUndefined();
    expect(error.finishReason).toBeUndefined();
  });

  it("exposes nothing beyond the approved fields", () => {
    // The whole point of the translation: a run directory is an artifact
    // people share, and a leaked authorization header in one is a credential
    // disclosure. Anything not on this list must not be reachable.
    const error = new ModelResponseError("m", { rawText: "x" });

    expect(Object.keys(error).sort()).toEqual(["finishReason", "rawText", "usage"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @handbook/podcast-providers test src/errors.test.ts`
Expected: FAIL — cannot resolve `./errors.ts`.

- [ ] **Step 3: Write the implementation**

`packages/podcast-providers/src/errors.ts`:

```ts
/**
 * The only error shape allowed to cross out of the provider layer.
 *
 * `ai-sdk.ts` is the one file permitted to import `ai`, so it is the one place
 * that can recognise the SDK's own errors. Everything downstream -- the engine,
 * the CLI -- is forbidden that import, which means without a translation here a
 * schema failure arrives as an opaque object nothing may legally inspect.
 *
 * The field list is a whitelist, not a summary. A run directory is an artifact
 * that gets shared, so the provider's error object, its headers, its stack and
 * anything carrying credentials are deliberately absent and must stay so.
 */

import type { Usage } from "./ports.ts";

export interface ModelResponseDetails {
  rawText?: string;
  usage?: Usage;
  finishReason?: string;
}

export class ModelResponseError extends Error {
  readonly rawText: string | undefined;
  readonly usage: Usage | undefined;
  readonly finishReason: string | undefined;

  constructor(message: string, details: ModelResponseDetails = {}) {
    super(message);
    // Written out longhand: `--experimental-strip-types` rejects parameter
    // properties outright, and Vitest would transpile past the mistake.
    this.name = "ModelResponseError";
    this.rawText = details.rawText;
    this.usage = details.usage;
    this.finishReason = details.finishReason;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @handbook/podcast-providers test src/errors.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing translation test**

Append to `packages/podcast-providers/src/errors.test.ts`:

```ts
import { NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { llmFromModel } from "./ai-sdk.ts";

describe("llmFromModel translation", () => {
  it("translates a schema failure into ModelResponseError", async () => {
    // A model returning prose instead of JSON is the most likely failure on
    // first contact with a real provider, and the raw text is the only thing
    // that makes it diagnosable.
    const model = {
      modelId: "test-model",
      async doGenerate(): Promise<never> {
        throw new NoObjectGeneratedError({
          message: "no object generated",
          text: "Sure! Here is a plan:",
          finishReason: "stop",
        });
      },
    };

    const port = llmFromModel("test", model as never);

    await expect(
      port.generate({ schema: z.object({ a: z.string() }), system: "s", prompt: "p" }),
    ).rejects.toThrow(ModelResponseError);

    const error = await port
      .generate({ schema: z.object({ a: z.string() }), system: "s", prompt: "p" })
      .catch((thrown: unknown) => thrown as ModelResponseError);

    expect(error.rawText).toBe("Sure! Here is a plan:");
    expect(error.finishReason).toBe("stop");
  });

  it("lets unrelated errors through untouched", async () => {
    // Translating everything would hide transport failures behind a schema
    // error, which points debugging at the wrong layer.
    const model = {
      modelId: "test-model",
      async doGenerate(): Promise<never> {
        throw new Error("ECONNREFUSED");
      },
    };

    const port = llmFromModel("test", model as never);

    await expect(
      port.generate({ schema: z.object({ a: z.string() }), system: "s", prompt: "p" }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @handbook/podcast-providers test src/errors.test.ts`
Expected: FAIL — the raw `NoObjectGeneratedError` escapes rather than a `ModelResponseError`.

- [ ] **Step 7: Add the translation**

In `packages/podcast-providers/src/ai-sdk.ts`, add to the imports:

```ts
import { NoObjectGeneratedError } from "ai";
import { ModelResponseError } from "./errors.ts";
```

Wrap the `generateObject` call in `llmFromModel`. The existing body becomes the `try`:

```ts
    async generate<T>(request: StructuredRequest<T>): Promise<LlmResult<T>> {
      try {
        const result = await generateObject({
          model,
          schema: request.schema,
          system: request.system,
          prompt: request.prompt,
          ...(request.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: request.maxOutputTokens }),
        });

        return {
          value: result.object as T,
          modelId: typeof model === "string" ? model : model.modelId,
          usage: {
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            speechCharacters: 0,
          },
        };
      } catch (error) {
        // Only this shape is translated. Anything else -- transport, auth,
        // rate limiting -- passes through, because relabelling it as a schema
        // failure would send debugging to the wrong layer.
        if (!NoObjectGeneratedError.isInstance(error)) throw error;

        throw new ModelResponseError(
          "the model did not return a value matching the schema",
          {
            ...(error.text === undefined ? {} : { rawText: error.text }),
            ...(error.finishReason === undefined ? {} : { finishReason: error.finishReason }),
            ...(error.usage === undefined
              ? {}
              : {
                  usage: {
                    inputTokens: error.usage.inputTokens ?? 0,
                    outputTokens: error.usage.outputTokens ?? 0,
                    speechCharacters: 0,
                  },
                }),
          },
        );
      }
    },
```

The conditional spreads are required by `exactOptionalPropertyTypes`: assigning `undefined` to an optional property is an error, so an absent field must be omitted rather than set.

- [ ] **Step 8: Export it**

Append to `packages/podcast-providers/src/index.ts`:

```ts
export * from "./errors.ts";
```

- [ ] **Step 9: Run tests and typecheck**

Run: `pnpm --filter @handbook/podcast-providers test`
Expected: PASS. **Record the new package total** (baseline 59 plus the tests added here).

Run: `pnpm --filter @handbook/podcast-providers check`
Expected: no output, exit 0.

- [ ] **Step 10: Format and commit**

```bash
npx prettier --write packages/podcast-providers
git add packages/podcast-providers
git commit -m "feat(providers): translate schema failures into a provider-neutral error"
```

---

### Task 2: buildPlanRequest and the planEpisode signature

**Files:**

- Modify: `packages/podcast-engine/src/plan.ts`
- Modify: `packages/podcast-engine/src/plan.test.ts` — 9 `planEpisode` call sites
- Modify: `packages/podcast-engine/src/corpus.test.ts` — 1 `planEpisode` call site

**Interfaces:**

- Consumes: `deriveExcerptIds` from `./ids.ts`; `DraftPlanSchema`, `DraftPlan` from `./schema.ts`; `SourcePack` from `@handbook/content`; `StructuredRequest` from `@handbook/podcast-providers`.
- Produces: `buildPlanRequest(pack, options): { request: StructuredRequest<DraftPlan>; excerptIds: string[] }` and `planEpisode(pack, budget, llm, options)` where `options` is `{ maxOutputTokens: number }`. Tasks 6 and 7 both call `buildPlanRequest`.

**Why this exists:** two defects in one fix. `planEpisode` never passed `maxOutputTokens`, so any estimate reporting a maximum output cost reports a limit nothing imposes. And `SYSTEM` is module-private, so an estimator outside this file could only duplicate the prompt — and a duplicate drifts, pricing text the model never receives.

**The builder derives ids; it does not accept them.** Taking them as a parameter would rebuild an unchecked parallel-array contract at a new site: `renderPrompt` skips an excerpt with no matching entry rather than failing, so a mismatch yields a prompt missing excerpts, a model that cannot cite what it never saw, and a citation error blaming the model.

- [ ] **Step 1: Write the failing tests**

Add to `packages/podcast-engine/src/plan.test.ts`:

```ts
import { buildPlanRequest } from "./plan.ts";

describe("buildPlanRequest", () => {
  it("returns the ids it derived alongside the request", () => {
    // Returning both is what stops a caller pairing a prompt with ids from a
    // different array. apportion already guards that invariant; there is no
    // reason to create a second place it can go wrong.
    const { request, excerptIds } = buildPlanRequest(
      pack([
        ["Alpha", 200],
        ["Beta", 200],
      ]),
      { maxOutputTokens: 4000 },
    );

    expect(excerptIds).toEqual(["doc#alpha", "doc#beta"]);
    for (const id of excerptIds) expect(request.prompt).toContain(id);
  });

  it("carries the system prompt and the token bound", () => {
    // The estimator prices this exact request. A system prompt missing here is
    // an estimate priced against text the model never receives.
    const { request } = buildPlanRequest(pack([["Alpha", 200]]), { maxOutputTokens: 1234 });

    expect(request.system.length).toBeGreaterThan(0);
    expect(request.maxOutputTokens).toBe(1234);
  });
});
```

And add to the existing `describe("planEpisode")`:

```ts
it("sends the token bound to the model", async () => {
  // The bound was advertised in the estimate and never applied. This is the
  // assertion that makes it real.
  const llm = new FakeLlm([goodDraft]);
  const seen: Array<number | undefined> = [];
  const recording = {
    name: "recording",
    generate: async <T>(request: StructuredRequest<T>) => {
      seen.push(request.maxOutputTokens);
      return llm.generate(request);
    },
  };

  await planEpisode(
    pack([
      ["Alpha", 200],
      ["Beta", 200],
    ]),
    budget(),
    recording,
    { maxOutputTokens: 4000 },
  );

  expect(seen).toEqual([4000]);
});
```

Add `import type { StructuredRequest } from "@handbook/podcast-providers";` to the test file's imports.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/plan.test.ts`
Expected: FAIL — `buildPlanRequest` is not exported, and `planEpisode` takes three arguments.

- [ ] **Step 3: Implement the builder and change the signature**

In `packages/podcast-engine/src/plan.ts`, add after `renderPrompt`:

```ts
export interface PlanRequestOptions {
  maxOutputTokens: number;
}

/**
 * The one construction of the plan request, shared by the caller that sends it
 * and the estimator that prices it.
 *
 * It derives the excerpt ids rather than accepting them. Accepting them would
 * let a caller pair this prompt with ids from a different array, and
 * `renderPrompt` skips an excerpt with no matching entry rather than failing --
 * so the symptom would be a model unable to cite what it was never shown, and
 * an error blaming the model for it.
 */
export function buildPlanRequest(
  pack: SourcePack,
  options: PlanRequestOptions,
): { request: StructuredRequest<DraftPlan>; excerptIds: string[] } {
  const excerptIds = deriveExcerptIds(pack.excerpts);

  return {
    request: {
      schema: DraftPlanSchema,
      system: SYSTEM,
      prompt: renderPrompt(pack, excerptIds),
      maxOutputTokens: options.maxOutputTokens,
    },
    excerptIds,
  };
}
```

Add `import type { StructuredRequest } from "@handbook/podcast-providers";` to the imports.

Then replace the body of `planEpisode` between the refusals and `validateCitations`:

```ts
export async function planEpisode(
  pack: SourcePack,
  budget: PlanBudget,
  llm: LlmPort,
  options: PlanRequestOptions,
): Promise<PlanResult> {
  assertPlanBudget(budget);
  if (pack.excerpts.every((excerpt) => excerpt.body.length === 0)) {
    throw new Error(`source pack for "${pack.topic}" has no excerpts with any text`);
  }

  const { request, excerptIds } = buildPlanRequest(pack, options);
  const result = await llm.generate<DraftPlan>(request);

  validateCitations(result.value, excerptIds);
```

The rest of the function is unchanged.

- [ ] **Step 4: Update every existing call site**

There are **10**: nine in `plan.test.ts` and one in `corpus.test.ts`. Each gains a fourth argument. In `plan.test.ts` the pattern is:

```ts
await planEpisode(pack([["Alpha", 200]]), budget(), llm, { maxOutputTokens: 4000 });
```

In `corpus.test.ts` the call already passes an inline budget object; add the fourth argument the same way:

```ts
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
  { maxOutputTokens: 4000 },
);
```

Verify none were missed: `grep -c "planEpisode(" packages/podcast-engine/src/plan.test.ts` must report 10 (9 calls plus the import line is not counted; recount after editing and confirm every call has four arguments).

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @handbook/podcast-engine test`
Expected: PASS. **Record the new package total** (baseline 68 plus the tests added here).

Run: `pnpm --filter @handbook/podcast-engine check`
Expected: no output, exit 0. This is the step that catches a missed call site — Vitest would not.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): share one plan request, and enforce the token bound"
```

---

### Task 3: Strict configuration

**Files:**

- Create: `packages/podcast-engine/src/config.ts`
- Test: `packages/podcast-engine/src/config.test.ts`

**Interfaces:**

- Consumes: `TEXT_PROVIDERS`, `ALL_LANGUAGES`, `SPEECH_LANGUAGE_COVERAGE` from `@handbook/podcast-providers`.
- Produces: `PodcastConfigSchema` (Zod), the type `PodcastConfig`, `CONFIG_TEMPLATE` (string), and `parseConfig(raw: unknown): PodcastConfig` which throws with the template on failure. Task 7 calls `parseConfig`.

**No filesystem access in this module.** Config load validates structure and values only. Checking that the runner executable exists belongs to `create --run` preflight — on this checkout `packages/podcast-providers/.venv/bin/python` does not exist, so an eager check would kill both `plan` and `plan --run` over a synthesis binary neither uses.

- [ ] **Step 1: Write the failing test**

`packages/podcast-engine/src/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";

function valid(): Record<string, unknown> {
  return {
    llm: { provider: "anthropic", modelId: "claude-x", maxOutputTokens: 4000 },
    prices: {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
      speechPerMillionCharacters: 0,
    },
    tts: {
      provider: "local",
      modelId: "mlx-community/Kokoro-82M-bf16",
      voice: "af_heart",
      language: "en-US",
      measuredOn: "Apple M4, 24 GB",
      charsPerSecond: 16.2,
      synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0.073 },
      runner: {
        name: "kokoro-82m",
        cwd: "packages/podcast-providers",
        command: ".venv/bin/python",
        args: ["-u", "runners/kokoro_mlx.py", "--text", "{text}", "--out", "{out}"],
        mediaType: "audio/wav",
        timeoutSeconds: 600,
      },
    },
    plan: { expansionFactor: 3, maxRenderSeconds: 300 },
  };
}

/** Replace one nested field, leaving the rest of a valid config intact. */
function withField(path: string[], value: unknown): Record<string, unknown> {
  const config = valid();
  let cursor = config as Record<string, unknown>;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  cursor[path[path.length - 1]!] = value;
  return config;
}

describe("parseConfig", () => {
  it("accepts a well-formed config", () => {
    expect(() => parseConfig(valid())).not.toThrow();
  });

  it("rejects an unrecognised key", () => {
    // This is what strict mode buys, and the assertion that proves it is on.
    const config = valid();
    (config["llm"] as Record<string, unknown>)["modelID"] = "typo";

    expect(() => parseConfig(config)).toThrow();
  });

  it("rejects a missing block", () => {
    const config = valid();
    delete config["prices"];

    expect(() => parseConfig(config)).toThrow();
  });

  it.each([
    ["llm.maxOutputTokens zero", ["llm", "maxOutputTokens"], 0],
    ["llm.maxOutputTokens fractional", ["llm", "maxOutputTokens"], 1.5],
    ["negative price", ["prices", "inputPerMillionTokens"], -1],
    ["charsPerSecond zero", ["tts", "charsPerSecond"], 0],
    ["fixedSeconds zero", ["tts", "synthesisCost", "fixedSeconds"], 0],
    ["negative marginalRtf", ["tts", "synthesisCost", "marginalRtf"], -0.1],
    ["timeoutSeconds zero", ["tts", "runner", "timeoutSeconds"], 0],
    ["expansionFactor zero", ["plan", "expansionFactor"], 0],
    ["maxRenderSeconds zero", ["plan", "maxRenderSeconds"], 0],
    ["blank modelId", ["llm", "modelId"], "   "],
  ] as Array<[string, string[], unknown]>)("rejects %s", (_label, path, value) => {
    expect(() => parseConfig(withField(path, value))).toThrow();
  });

  it("accepts a zero marginalRtf and a zero speech price", () => {
    // Both are meaningful zeros: synthesis with no per-second cost, and local
    // synthesis that costs nothing per character. Rejecting them would forbid
    // the only configuration this CLI currently supports.
    expect(() => parseConfig(withField(["tts", "synthesisCost", "marginalRtf"], 0))).not.toThrow();
    expect(() => parseConfig(withField(["prices", "speechPerMillionCharacters"], 0))).not.toThrow();
  });

  it("rejects a speech provider it cannot construct", () => {
    // "banana" passes trimmed-non-empty and would fail much later, at
    // synthesis, with an error about something else.
    expect(() => parseConfig(withField(["tts", "provider"], "banana"))).toThrow();
    expect(() => parseConfig(withField(["tts", "provider"], "elevenlabs"))).toThrow();
  });

  it("rejects a language the local profile does not cover", () => {
    // ta-IN is a real language tag, and local coverage is deliberately
    // ["en-US", "en-GB"] because most small local models are English-only.
    // Failing here beats producing confident audio in the wrong language.
    expect(() => parseConfig(withField(["tts", "language"], "elvish"))).toThrow();
    expect(() => parseConfig(withField(["tts", "language"], "ta-IN"))).toThrow();
    expect(() => parseConfig(withField(["tts", "language"], "en-GB"))).not.toThrow();
  });

  it("does not touch the filesystem", () => {
    // The runner command need not exist to plan an episode. An eager check
    // here would kill `plan` on any machine without the synthesis venv.
    const config = withField(["tts", "runner", "command"], "/nonexistent/python");

    expect(() => parseConfig(config)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/config.test.ts`
Expected: FAIL — cannot resolve `./config.ts`.

- [ ] **Step 3: Write the implementation**

`packages/podcast-engine/src/config.ts`:

```ts
/**
 * The operator's configuration, validated before anything is spent.
 *
 * Strict on keys so a misspelling fails rather than silently reverting to
 * nothing, and bounded on values because `.strict()` says nothing about
 * `charsPerSecond: 0` -- which divides -- or a negative token bound, which
 * reaches a provider.
 *
 * The bounds deliberately mirror `assertPlanBudget`, including its asymmetry:
 * `fixedSeconds` is a divisor so it must be positive, while `marginalRtf` may
 * legitimately be zero. Duplicating them moves the failure from partway through
 * a run to config load, where the message can name the file and the field.
 *
 * Nothing here touches the filesystem. Whether the runner command exists is a
 * question for `create --run` preflight; asking it at load would stop `plan`
 * working on any machine without the synthesis venv.
 */

import { z } from "zod";
import {
  ALL_LANGUAGES,
  SPEECH_LANGUAGE_COVERAGE,
  TEXT_PROVIDERS,
} from "@handbook/podcast-providers";

const identifier = z.string().trim().min(1);
const positive = z.number().finite().positive();
const nonNegative = z.number().finite().nonnegative();

const languageTag = z
  .enum(ALL_LANGUAGES as unknown as [string, ...string[]])
  .refine((tag) => (SPEECH_LANGUAGE_COVERAGE["local"] ?? []).includes(tag as never), {
    message: `local speech covers only ${(SPEECH_LANGUAGE_COVERAGE["local"] ?? []).join(", ")}`,
  });

export const PodcastConfigSchema = z
  .object({
    llm: z
      .object({
        provider: z.enum(TEXT_PROVIDERS as unknown as [string, ...string[]]),
        modelId: identifier,
        maxOutputTokens: z.number().int().positive(),
      })
      .strict(),
    prices: z
      .object({
        inputPerMillionTokens: nonNegative,
        outputPerMillionTokens: nonNegative,
        speechPerMillionCharacters: nonNegative,
      })
      .strict(),
    tts: z
      .object({
        // The only speech provider this configuration can construct: `runner`
        // describes a subprocess and `createLocalTts` is what consumes it.
        provider: z.literal("local"),
        modelId: identifier,
        voice: identifier,
        language: languageTag,
        measuredOn: identifier,
        charsPerSecond: positive,
        synthesisCost: z.object({ fixedSeconds: positive, marginalRtf: nonNegative }).strict(),
        runner: z
          .object({
            name: identifier,
            cwd: identifier.optional(),
            command: identifier,
            args: z.array(identifier),
            mediaType: identifier.optional(),
            timeoutSeconds: positive.optional(),
          })
          .strict(),
      })
      .strict(),
    plan: z.object({ expansionFactor: positive, maxRenderSeconds: positive }).strict(),
  })
  .strict();

export type PodcastConfig = z.infer<typeof PodcastConfigSchema>;

export const CONFIG_TEMPLATE = `{
  "llm": { "provider": "anthropic", "modelId": "claude-...", "maxOutputTokens": 4000 },
  "prices": {
    "inputPerMillionTokens": 3.0,
    "outputPerMillionTokens": 15.0,
    "speechPerMillionCharacters": 0
  },
  "tts": {
    "provider": "local",
    "modelId": "mlx-community/Kokoro-82M-bf16",
    "voice": "af_heart",
    "language": "en-US",
    "measuredOn": "Apple M4, 24 GB",
    "charsPerSecond": 16.2,
    "synthesisCost": { "fixedSeconds": 3.16, "marginalRtf": 0.073 },
    "runner": {
      "name": "kokoro-82m",
      "cwd": "packages/podcast-providers",
      "command": ".venv/bin/python",
      "args": ["-u", "runners/kokoro_mlx.py", "--text", "{text}", "--out", "{out}"],
      "mediaType": "audio/wav",
      "timeoutSeconds": 600
    }
  },
  "plan": { "expansionFactor": 3, "maxRenderSeconds": 300 }
}`;

export function parseConfig(raw: unknown): PodcastConfig {
  const parsed = PodcastConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  throw new Error(
    `podcast.config.json is not valid:\n${parsed.error.message}\n\nExpected shape:\n${CONFIG_TEMPLATE}`,
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @handbook/podcast-engine test src/config.test.ts`
Expected: PASS. **Record the count.**

Run: `pnpm --filter @handbook/podcast-engine check`
Expected: exit 0.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): validate podcast configuration strictly and by value"
```

---

### Task 4: The run lifecycle

**Files:**

- Create: `packages/podcast-engine/src/run.ts`
- Test: `packages/podcast-engine/src/run.test.ts`

**Interfaces:**

- Produces: `sanitiseSegment(value: string): string` (throws on empty, `.`, `..`), `makeRunId(now: Date, suffix: string): string`, and `reserveRunDirectory(root: string, documentId: string, runId: string): Promise<string>` returning the created path. Task 7 calls all three.

**The reservation point is fixed by the spec** and both plausible alternatives are wrong: reserving after the model returns leaves nowhere to write `failure.json`, and reserving at process start creates directories for invocations that never had a chance.

- [ ] **Step 1: Write the failing test**

`packages/podcast-engine/src/run.test.ts`:

```ts
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeRunId, reserveRunDirectory, sanitiseSegment } from "./run.ts";

describe("sanitiseSegment", () => {
  it("replaces characters that are unsafe in a path", () => {
    expect(sanitiseSegment("module:06-mcp")).toBe("module-06-mcp");
    expect(sanitiseSegment("lab/semantic-cache")).toBe("lab-semantic-cache");
    expect(sanitiseSegment("a\\b")).toBe("a-b");
  });

  it("collapses and trims separators", () => {
    expect(sanitiseSegment("a:::b")).toBe("a-b");
    expect(sanitiseSegment(":lead-and-trail:")).toBe("lead-and-trail");
  });

  it("rejects rather than repairs a traversing or empty result", () => {
    // "." and ".." survive the replacement unchanged and are exactly the two
    // names that traverse rather than nest. Repairing them would invent a
    // directory name the operator never asked for.
    expect(() => sanitiseSegment("...")).toThrow();
    expect(() => sanitiseSegment(".")).toThrow();
    expect(() => sanitiseSegment("..")).toThrow();
    expect(() => sanitiseSegment("")).toThrow();
    expect(() => sanitiseSegment(":::")).toThrow();
  });
});

describe("makeRunId", () => {
  it("is filesystem-safe and carries the suffix", () => {
    const id = makeRunId(new Date("2026-08-16T13:42:07.000Z"), "a3f9c1");

    expect(id).toBe("2026-08-16T13-42-07Z-a3f9c1");
    expect(id).not.toContain(":");
  });
});

describe("reserveRunDirectory", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "podcast-run-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates the run directory and returns its path", async () => {
    const created = await reserveRunDirectory(root, "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");

    expect(created).toBe(join(root, "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1"));
    expect(await readdir(join(root, "module-06-mcp"))).toEqual(["2026-08-16T13-42-07Z-a3f9c1"]);
  });

  it("refuses an existing directory rather than overwriting it", async () => {
    // Runs are evidence. Silently replacing one destroys the artifact someone
    // is comparing against, and the refusal must happen before the model call
    // so a name clash never costs money.
    await reserveRunDirectory(root, "doc", "run-1");

    await expect(reserveRunDirectory(root, "doc", "run-1")).rejects.toThrow(/already exists/);
  });

  it("allows two runs for the same document", async () => {
    await reserveRunDirectory(root, "doc", "run-1");

    await expect(reserveRunDirectory(root, "doc", "run-2")).resolves.toContain("run-2");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/run.test.ts`
Expected: FAIL — cannot resolve `./run.ts`.

- [ ] **Step 3: Write the implementation**

`packages/podcast-engine/src/run.ts`:

```ts
/**
 * Where a run's artifacts live, and when the directory comes into existence.
 *
 * Creation has exactly one defined point -- after pre-call validation and
 * before the model call -- because both alternatives are wrong. Reserving after
 * the model returns leaves nowhere to write diagnostics when it returns
 * unusable output, which is the most likely first-contact failure. Reserving at
 * process start creates directories for invocations that never had a chance of
 * running.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * A path segment safe on every platform, or an error.
 *
 * Rejects rather than repairs the traversing names: `.` and `..` survive the
 * replacement below unchanged, and quietly rewriting them would invent a
 * directory the operator never named.
 */
export function sanitiseSegment(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (cleaned === "" || cleaned === "." || cleaned === "..") {
    throw new Error(`"${value}" cannot be used as a directory name`);
  }
  return cleaned;
}

/**
 * A run id that sorts chronologically and cannot collide within a second.
 *
 * The suffix is not decoration. Second-resolution timestamps collide, and with
 * the never-overwrite rule a collision would surface as a spurious refusal --
 * the safety rule appearing to misfire. The clock and the suffix are arguments
 * so tests can force both outcomes without sleeping.
 */
export function makeRunId(now: Date, suffix: string): string {
  return `${now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-")}-${suffix}`;
}

/**
 * Reserves the run directory, atomically.
 *
 * The leaf is created with `recursive: false` so an existing path fails rather
 * than succeeding silently. That is what makes the collision check a check and
 * not a race.
 */
export async function reserveRunDirectory(
  root: string,
  documentSegment: string,
  runId: string,
): Promise<string> {
  const parent = join(root, documentSegment);
  await mkdir(parent, { recursive: true });

  const path = join(parent, runId);
  try {
    await mkdir(path, { recursive: false });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new Error(`run directory already exists, refusing to overwrite: ${path}`);
    }
    throw error;
  }
  return path;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @handbook/podcast-engine test src/run.test.ts`
Expected: PASS. **Record the count.**

Run: `pnpm --filter @handbook/podcast-engine check`
Expected: exit 0.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): reserve run directories atomically, and never overwrite one"
```

---

### Task 5: The manifest

**Files:**

- Create: `packages/podcast-engine/src/manifest.ts`
- Test: `packages/podcast-engine/src/manifest.test.ts`

**Interfaces:**

- Consumes: `PodcastConfig` from `./config.ts`; `Usage`, `PriceList` from `@handbook/podcast-providers`.
- Produces: `ManifestSchema` (a Zod discriminated union), the type `Manifest`, and `writeManifest(directory: string, manifest: unknown): Promise<void>` which validates before writing. Task 7 calls `writeManifest`.

**A discriminated union, not a flat object with an optional `failure`.** A flat shape admits `complete` carrying a failure and `failed` carrying none — two states that should be unrepresentable in the one file whose job is to say which happened.

- [ ] **Step 1: Write the failing test**

`packages/podcast-engine/src/manifest.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManifestSchema, writeManifest } from "./manifest.ts";

function common() {
  return {
    manifestVersion: 1,
    command: "plan",
    documentId: "module:06-mcp",
    runId: "2026-08-16T13-42-07Z-a3f9c1",
    startedAt: "2026-08-16T13:42:07.000Z",
    finishedAt: "2026-08-16T13:42:19.000Z",
    request: { durationSeconds: 2400 },
    artifacts: ["plan.json", "manifest.json"],
  };
}

function completeManifest(overrides: Record<string, unknown> = {}) {
  return {
    ...common(),
    status: "complete",
    source: { sourceHash: "abc", excerptCount: 24, droppedForBudget: [] },
    model: { modelId: "claude-x" },
    usage: { inputTokens: 100, outputTokens: 20, speechCharacters: 0 },
    cost: { estimatedAtMaxOutput: 0.115, measured: 0.06 },
    ...overrides,
  };
}

describe("ManifestSchema", () => {
  it("accepts a complete manifest", () => {
    expect(ManifestSchema.safeParse(completeManifest()).success).toBe(true);
  });

  it("rejects a complete manifest carrying a failure", () => {
    // The state that must be unrepresentable: the one file whose job is to say
    // which happened, saying both.
    const manifest = completeManifest({ failure: { stage: "plan", message: "x" } });

    expect(ManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects a failed manifest with no failure", () => {
    const manifest = { ...common(), status: "failed" };

    expect(ManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("accepts a failed manifest missing source, model, usage and cost", () => {
    // A run can die before any of them exists -- an unknown document id
    // reaches no model, and a schema failure may carry no usage.
    const manifest = {
      ...common(),
      status: "failed",
      failure: { stage: "plan", message: "the model did not return a value matching the schema" },
    };

    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("rejects a complete manifest missing what a finished run must have", () => {
    const manifest = completeManifest();
    delete (manifest as Record<string, unknown>)["usage"];

    expect(ManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe("writeManifest", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "podcast-manifest-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("writes a valid manifest", async () => {
    await writeManifest(directory, completeManifest());

    const written = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    expect(written.status).toBe("complete");
  });

  it("refuses to write an invalid manifest", async () => {
    // A malformed manifest is indistinguishable from a missing one to anything
    // reading it, and a run with no manifest is a run whose status is unknown.
    await expect(writeManifest(directory, { ...common(), status: "failed" })).rejects.toThrow();

    await expect(readFile(join(directory, "manifest.json"), "utf8")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/manifest.test.ts`
Expected: FAIL — cannot resolve `./manifest.ts`.

- [ ] **Step 3: Write the implementation**

`packages/podcast-engine/src/manifest.ts`:

```ts
/**
 * The file that declares whether a run happened.
 *
 * A discriminated union on `status`, not a flat object with an optional
 * `failure`. A flat shape admits `complete` carrying a failure and `failed`
 * carrying none -- two states that should be unrepresentable in the one file
 * whose job is to say which occurred.
 *
 * Validated before it reaches disk, because a malformed manifest is
 * indistinguishable from a missing one to anything reading it, and a run with
 * no manifest is a run whose status is unknown.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const UsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  speechCharacters: z.number(),
});

const SourceSchema = z.object({
  sourceHash: z.string(),
  excerptCount: z.number(),
  droppedForBudget: z.array(z.string()),
});

const CommonSchema = {
  manifestVersion: z.literal(1),
  command: z.enum(["plan", "create"]),
  documentId: z.string(),
  runId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  request: z.object({ durationSeconds: z.number() }),
  resolvedConfig: z.unknown().optional(),
  artifacts: z.array(z.string()),
};

const CompleteSchema = z.object({
  ...CommonSchema,
  status: z.literal("complete"),
  source: SourceSchema,
  model: z.object({ modelId: z.string() }),
  usage: UsageSchema,
  cost: z.object({ estimatedAtMaxOutput: z.number(), measured: z.number() }),
});

const FailedSchema = z.object({
  ...CommonSchema,
  status: z.literal("failed"),
  failure: z.object({ stage: z.string(), message: z.string() }),
  source: SourceSchema.optional(),
  model: z.object({ modelId: z.string() }).optional(),
  usage: UsageSchema.optional(),
  cost: z.object({ estimatedAtMaxOutput: z.number(), measured: z.number().nullable() }).optional(),
});

export const ManifestSchema = z.discriminatedUnion("status", [CompleteSchema, FailedSchema]);

export type Manifest = z.infer<typeof ManifestSchema>;

export async function writeManifest(directory: string, manifest: unknown): Promise<void> {
  const parsed = ManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error(`refusing to write an invalid manifest: ${parsed.error.message}`);
  }
  await writeFile(join(directory, "manifest.json"), `${JSON.stringify(parsed.data, null, 2)}\n`);
}
```

Note: `CompleteSchema` and `FailedSchema` are not `.strict()`. A discriminated union with strict members rejects the extra discriminator key in some Zod configurations; strictness here would also block adding a field in a later `manifestVersion`. Unknown-key rejection is a config concern, where operators hand-edit; a manifest is machine-written.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @handbook/podcast-engine test src/manifest.test.ts`
Expected: PASS. **Record the count.**

Run: `pnpm --filter @handbook/podcast-engine check`
Expected: exit 0.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): make a manifest say exactly one thing about a run"
```

---

### Task 6: The scoped estimate

**Files:**

- Create: `packages/podcast-engine/src/estimate.ts`
- Test: `packages/podcast-engine/src/estimate.test.ts`

**Interfaces:**

- Consumes: `buildPlanRequest` from `./plan.ts`; `estimateTokens` from `@handbook/content`; `PriceList` from `@handbook/podcast-providers`.
- Produces: `estimatePlanCost(request, prices, maxOutputTokens): CostBreakdown` where `CostBreakdown` is `{ inputTokens, inputCost, maxOutputTokens, maxOutputCost, estimatedAtMaxOutput }`. Task 7 renders it.

**The total is not an upper bound and must not be named one.** Only output is capped. Input is an estimate that can be exceeded for two independent reasons: `estimateTokens` is four-characters-per-token by design, and structured-output calls send the JSON schema as request framing no character count of the prompt can see.

- [ ] **Step 1: Write the failing test**

`packages/podcast-engine/src/estimate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PriceList } from "@handbook/podcast-providers";
import { estimatePlanCost } from "./estimate.ts";

const prices: PriceList = {
  inputPerMillionTokens: 3,
  outputPerMillionTokens: 15,
  speechPerMillionCharacters: 100,
};

describe("estimatePlanCost", () => {
  it("prices input from the request and output from the cap", () => {
    const request = { system: "s".repeat(400), prompt: "p".repeat(3600) };

    const breakdown = estimatePlanCost(request, prices, 4000);

    // 4000 characters at four per token is 1000 tokens.
    expect(breakdown.inputTokens).toBe(1000);
    expect(breakdown.inputCost).toBeCloseTo(0.003, 6);
    expect(breakdown.maxOutputTokens).toBe(4000);
    expect(breakdown.maxOutputCost).toBeCloseTo(0.06, 6);
    expect(breakdown.estimatedAtMaxOutput).toBeCloseTo(0.063, 6);
  });

  it("excludes speech entirely, even when speech is priced", () => {
    // `plan` does not synthesise. Pricing synthesis into its total would put
    // dollars on work the command never performs -- visibly wrong the moment a
    // hosted TTS profile is configured, which is why this uses a non-zero
    // speech price rather than the local zero.
    const request = { system: "s".repeat(400), prompt: "p".repeat(3600) };

    const breakdown = estimatePlanCost(request, prices, 4000);

    expect(breakdown.estimatedAtMaxOutput).toBeCloseTo(
      breakdown.inputCost + breakdown.maxOutputCost,
      10,
    );
    expect(Object.keys(breakdown)).not.toContain("speechCost");
  });

  it("counts the system prompt, not only the prompt", () => {
    // The estimator prices the exact request that will be sent. Omitting the
    // system text prices something the model never receives.
    const withSystem = estimatePlanCost({ system: "s".repeat(400), prompt: "p" }, prices, 100);
    const withoutSystem = estimatePlanCost({ system: "", prompt: "p" }, prices, 100);

    expect(withSystem.inputTokens).toBeGreaterThan(withoutSystem.inputTokens);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/estimate.test.ts`
Expected: FAIL — cannot resolve `./estimate.ts`.

- [ ] **Step 3: Write the implementation**

`packages/podcast-engine/src/estimate.ts`:

```ts
/**
 * What a plan call will cost, scoped to what it actually does.
 *
 * The total is `estimatedAtMaxOutput`, not an upper bound, and the name is the
 * honest part. Only the output side is capped. Input is an estimate that can be
 * exceeded twice over: `estimateTokens` is four characters per token by design,
 * and a structured-output call sends the JSON schema as request framing that no
 * character count of the prompt string can see.
 *
 * Speech is absent rather than zero. `plan` does not synthesise, so pricing
 * synthesis into its total would put dollars on work the command never
 * performs.
 */

import { estimateTokens } from "@handbook/content";
import type { PriceList } from "@handbook/podcast-providers";

export interface CostBreakdown {
  inputTokens: number;
  inputCost: number;
  maxOutputTokens: number;
  maxOutputCost: number;
  /** Deliberately not "upper bound": input is not capped. */
  estimatedAtMaxOutput: number;
}

export function estimatePlanCost(
  request: { system: string; prompt: string },
  prices: PriceList,
  maxOutputTokens: number,
): CostBreakdown {
  const inputTokens = estimateTokens(`${request.system}${request.prompt}`);
  const inputCost = (inputTokens / 1_000_000) * prices.inputPerMillionTokens;
  const maxOutputCost = (maxOutputTokens / 1_000_000) * prices.outputPerMillionTokens;

  return {
    inputTokens,
    inputCost,
    maxOutputTokens,
    maxOutputCost,
    estimatedAtMaxOutput: inputCost + maxOutputCost,
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @handbook/podcast-engine test src/estimate.test.ts`
Expected: PASS. **Record the count.**

Run: `pnpm --filter @handbook/podcast-engine check`
Expected: exit 0.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write packages/podcast-engine
git add packages/podcast-engine
git commit -m "feat(engine): estimate a plan call without claiming a ceiling"
```

---

### Task 7: The CLI

**Files:**

- Create: `packages/podcast-engine/src/cli.ts`
- Test: `packages/podcast-engine/src/cli.test.ts`
- Create: `podcast.config.example.json`
- Modify: `packages/podcast-engine/src/index.ts`
- Modify: `.gitignore`
- Modify: `eslint.config.js`

**Interfaces:**

- Consumes: everything from Tasks 1–6, plus `loadAllDocuments` and `buildSourcePack` from `@handbook/content` and `createLlm` from `@handbook/podcast-providers`.
- Produces: `runCli(argv: string[], deps: CliDeps): Promise<number>` returning an exit code, where `CliDeps` is `{ cwd: string; env: Record<string, string | undefined>; now: () => Date; suffix: () => string; llm?: LlmPort; log: (line: string) => void }`. The module's entry point calls it with real dependencies and `process.exit`s on the result.

**Dependency injection is what makes the `--run` path testable.** Only the live-provider call needs a network; everything else — argument parsing, credential refusal, request construction, artifact writing, diagnostics, refusal — runs offline against `FakeLlm` with an injected clock and suffix.

- [ ] **Step 1: Write the failing test**

`packages/podcast-engine/src/cli.test.ts`:

```ts
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeLlm } from "@handbook/podcast-providers";
import { ModelResponseError } from "@handbook/podcast-providers";
import { runCli } from "./cli.ts";
import { CONFIG_TEMPLATE } from "./config.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

let outRoot = "";
let configPath = "";
let lines: string[] = [];

const draft = {
  title: "What MCP standardises",
  throughLine: "MCP is a transport contract, not a capability.",
  beats: [{ title: "Open", intent: "Frame it", excerptIds: [] as string[], weight: 1 }],
  unsupported: [],
};

function deps(overrides: Record<string, unknown> = {}) {
  return {
    cwd: REPO_ROOT,
    env: { PODCAST_LLM_API_KEY: "test-key" } as Record<string, string | undefined>,
    now: () => new Date("2026-08-16T13:42:07.000Z"),
    suffix: () => "a3f9c1",
    log: (line: string) => lines.push(line),
    ...overrides,
  };
}

beforeEach(async () => {
  outRoot = await mkdtemp(join(tmpdir(), "podcast-cli-"));
  configPath = join(outRoot, "podcast.config.json");
  await writeFile(configPath, CONFIG_TEMPLATE.replace('"claude-..."', '"claude-test"'));
  lines = [];
});

afterEach(async () => {
  await rm(outRoot, { recursive: true, force: true });
});

const base = (extra: string[] = []) => [
  "plan",
  "module:06-mcp",
  "--duration",
  "2400",
  "--config",
  configPath,
  "--out",
  join(outRoot, "runs"),
  ...extra,
];

describe("runCli — dry plan", () => {
  it("prints an estimate, writes nothing, and exits zero", async () => {
    // A dry run is a success that writes nothing. A directory holding only an
    // estimate would be an artifact implying work that did not happen.
    const llm = new FakeLlm([draft]);

    const code = await runCli(base(), deps({ llm }));

    expect(code).toBe(0);
    expect(llm.calls).toHaveLength(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
    expect(lines.join("\n")).toMatch(/estimated at max output/i);
  });

  it("names what it excludes", async () => {
    await runCli(base(), deps({ llm: new FakeLlm([draft]) }));

    const output = lines.join("\n");
    expect(output).toMatch(/dialogue/);
    expect(output).toMatch(/not implemented/);
  });

  it("runs without a credential", async () => {
    // The estimate path must work in CI, or for someone without a key.
    const code = await runCli(base(), deps({ env: {}, llm: new FakeLlm([draft]) }));

    expect(code).toBe(0);
  });
});

describe("runCli — pre-reservation failures", () => {
  it.each([
    ["missing duration", ["plan", "module:06-mcp", "--config", configPath]],
    [
      "non-numeric duration",
      ["plan", "module:06-mcp", "--duration", "abc", "--config", configPath],
    ],
    ["zero duration", ["plan", "module:06-mcp", "--duration", "0", "--config", configPath]],
    [
      "unknown document",
      ["plan", "nope:nope", "--duration", "2400", "--config", configPath, "--run"],
    ],
  ] as Array<[string, string[]]>)("leaves the output root untouched: %s", async (_label, argv) => {
    const llm = new FakeLlm([draft]);

    const code = await runCli([...argv, "--out", join(outRoot, "runs")], deps({ llm }));

    expect(code).not.toBe(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
  });

  it("refuses --run with no credential, before any call", async () => {
    const llm = new FakeLlm([draft]);

    const code = await runCli(base(["--run"]), deps({ env: {}, llm }));

    expect(code).not.toBe(0);
    expect(llm.calls).toHaveLength(0);
    await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
  });
});

describe("runCli — create", () => {
  it("refuses with and without --run, naming the missing stages", async () => {
    for (const argv of [
      ["create", ...base().slice(1)],
      ["create", ...base(["--run"]).slice(1)],
    ]) {
      lines = [];
      const llm = new FakeLlm([draft]);

      const code = await runCli(argv, deps({ llm }));

      expect(code).not.toBe(0);
      expect(llm.calls).toHaveLength(0);
      expect(lines.join("\n")).toMatch(/dialogue/);
      await expect(readdir(join(outRoot, "runs"))).rejects.toThrow();
    }
  });
});
```

The `--run` success and schema-failure cases need real excerpt ids, which depend on the corpus. Add them after the implementation exists, following Step 6.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @handbook/podcast-engine test src/cli.test.ts`
Expected: FAIL — cannot resolve `./cli.ts`.

- [ ] **Step 3: Write the CLI**

`packages/podcast-engine/src/cli.ts`. It is long, and the shape matters more than any single line:

```ts
/**
 * The operator entry point.
 *
 * Two commands that are not variations of each other: `plan` answers whether a
 * real model returns a draft this pipeline can use, and `create` produces a
 * playable episode. Only the first is implementable today, and `create`
 * refuses rather than pretending otherwise -- a command that names the
 * destination is what stops `plan` being mistaken for the product.
 *
 * Every dependency that touches the world -- the clock, the id suffix, the
 * model, the log sink -- is injected, so the whole `--run` path is testable
 * without a network.
 */

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { buildSourcePack, loadAllDocuments } from "@handbook/content";
import { createLlm, ModelResponseError } from "@handbook/podcast-providers";
import type { LlmPort } from "@handbook/podcast-providers";
import { parseConfig } from "./config.ts";
import { estimatePlanCost } from "./estimate.ts";
import { writeManifest } from "./manifest.ts";
import { buildPlanRequest, planEpisode } from "./plan.ts";
import { makeRunId, reserveRunDirectory, sanitiseSegment } from "./run.ts";

export interface CliDeps {
  cwd: string;
  env: Record<string, string | undefined>;
  now: () => Date;
  suffix: () => string;
  log: (line: string) => void;
  llm?: LlmPort;
}

const MISSING_STAGES = "dialogue, review, revision, voice script, synthesis, assembly";

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const command = argv[0];
  const documentId = argv[1];

  if (command !== "plan" && command !== "create") {
    deps.log("usage: cli.ts plan|create <documentId> --duration <seconds> [--run]");
    return 2;
  }
  if (documentId === undefined || documentId.startsWith("--")) {
    deps.log("a document id is required, e.g. module:06-mcp");
    return 2;
  }

  const durationRaw = flag(argv, "duration");
  const durationSeconds = Number(durationRaw);
  if (durationRaw === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    deps.log("--duration must be a number of seconds greater than zero");
    return 2;
  }

  // `create` refuses here: after argument validation, before anything is read
  // or spent. It cannot honestly estimate a pipeline whose stages do not exist.
  if (command === "create") {
    deps.log(`create is not implemented: it needs ${MISSING_STAGES}.`);
    deps.log("`plan` is available and validates the planning stage against a real model.");
    return 1;
  }

  const configPath = flag(argv, "config") ?? join(deps.cwd, "podcast.config.json");
  let config;
  try {
    config = parseConfig(JSON.parse(await readFile(configPath, "utf8")));
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const wantsRun = argv.includes("--run");
  const apiKey = deps.env["PODCAST_LLM_API_KEY"];
  if (wantsRun && (apiKey === undefined || apiKey === "")) {
    deps.log("PODCAST_LLM_API_KEY is required with --run");
    return 2;
  }

  let documentSegment: string;
  try {
    documentSegment = sanitiseSegment(documentId);
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 2;
  }

  let pack;
  try {
    const documents = await loadAllDocuments(deps.cwd);
    pack = buildSourcePack(documents, documentId);
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const { request } = buildPlanRequest(pack, { maxOutputTokens: config.llm.maxOutputTokens });
  const breakdown = estimatePlanCost(request, config.prices, config.llm.maxOutputTokens);

  deps.log(
    `  pack            ${pack.excerpts.length} excerpts, ~${breakdown.inputTokens} est. input tokens`,
  );
  deps.log(`  model           ${config.llm.provider}:${config.llm.modelId}`);
  deps.log("");
  deps.log(
    `  input (est.)    ${breakdown.inputTokens} tok   $${breakdown.inputCost.toFixed(4)}   estimated, NOT capped`,
  );
  deps.log(
    `  output (cap)    ${breakdown.maxOutputTokens} tok   $${breakdown.maxOutputCost.toFixed(4)}   enforced via maxOutputTokens`,
  );
  deps.log(`  estimated at max output       $${breakdown.estimatedAtMaxOutput.toFixed(4)}`);
  deps.log("");
  deps.log("  input is an approximation and can exceed this; only output is capped");
  deps.log("  covers          plan only");
  deps.log(`  excludes        ${MISSING_STAGES} — these stages are not implemented`);

  if (!wantsRun) {
    deps.log("");
    deps.log("  (estimate only — pass --run to call the model)");
    return 0;
  }

  const outRoot = flag(argv, "out") ?? join(deps.cwd, ".podcast");
  const root = isAbsolute(outRoot) ? outRoot : join(deps.cwd, outRoot);
  const runId = makeRunId(deps.now(), deps.suffix());
  const startedAt = deps.now().toISOString();

  let directory: string;
  try {
    directory = await reserveRunDirectory(root, documentSegment, runId);
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const llm =
    deps.llm ??
    createLlm(config.llm.provider as "openai" | "anthropic", {
      apiKey: apiKey as string,
      modelId: config.llm.modelId,
    });

  const common = {
    manifestVersion: 1 as const,
    command: "plan" as const,
    documentId,
    runId,
    startedAt,
    request: { durationSeconds },
    resolvedConfig: config,
  };

  try {
    const { plan, usage, modelId } = await planEpisode(
      pack,
      {
        requestedSeconds: durationSeconds,
        expansionFactor: config.plan.expansionFactor,
        charsPerSecond: config.tts.charsPerSecond,
        maxRenderSeconds: config.plan.maxRenderSeconds,
        synthesisCost: config.tts.synthesisCost,
      },
      llm,
      { maxOutputTokens: config.llm.maxOutputTokens },
    );

    await writeFile(join(directory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const measured =
      (usage.inputTokens / 1_000_000) * config.prices.inputPerMillionTokens +
      (usage.outputTokens / 1_000_000) * config.prices.outputPerMillionTokens;

    await writeManifest(directory, {
      ...common,
      status: "complete",
      finishedAt: deps.now().toISOString(),
      source: {
        sourceHash: pack.sourceHash,
        excerptCount: pack.excerpts.length,
        droppedForBudget: pack.droppedForBudget,
      },
      model: { modelId },
      usage,
      cost: { estimatedAtMaxOutput: breakdown.estimatedAtMaxOutput, measured },
      artifacts: ["plan.json", "manifest.json"],
    });

    deps.log("");
    deps.log(`  wrote ${directory}`);
    return 0;
  } catch (error) {
    const artifacts = ["manifest.json"];
    if (error instanceof ModelResponseError) {
      // The raw text is the only thing that makes this diagnosable, and it is
      // the reason the provider layer translates the SDK's error at all.
      await writeFile(
        join(directory, "failure.json"),
        `${JSON.stringify(
          { rawText: error.rawText, finishReason: error.finishReason, usage: error.usage },
          null,
          2,
        )}\n`,
      );
      artifacts.unshift("failure.json");
    }

    await writeManifest(directory, {
      ...common,
      status: "failed",
      finishedAt: deps.now().toISOString(),
      failure: { stage: "plan", message: error instanceof Error ? error.message : String(error) },
      source: {
        sourceHash: pack.sourceHash,
        excerptCount: pack.excerpts.length,
        droppedForBudget: pack.droppedForBudget,
      },
      cost: { estimatedAtMaxOutput: breakdown.estimatedAtMaxOutput, measured: null },
      artifacts,
    });

    deps.log("");
    deps.log(`  failed — diagnostics in ${directory}`);
    return 1;
  }
}
```

Then the entry point, at the end of the same file:

```ts
// Only runs when invoked directly, so the module stays importable by tests.
if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")
) {
  const code = await runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    now: () => new Date(),
    suffix: () => Math.random().toString(16).slice(2, 8),
    log: (line: string) => console.log(line),
  });
  process.exit(code);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @handbook/podcast-engine test src/cli.test.ts`
Expected: PASS. If the dry-run test fails because a directory _was_ created, that is the regression this task exists to prevent — fix `cli.ts`, not the test.

- [ ] **Step 5: Add the console exemption**

In `eslint.config.js`, change the `scripts/**` block to cover CLI modules too:

```js
  {
    // CLI scripts are expected to print to stdout.
    files: ["scripts/**/*.ts", "**/src/cli.ts"],
    rules: {
      "no-console": "off",
    },
  },
```

- [ ] **Step 6: Add the `--run` tests**

Append to `cli.test.ts`. These use the real corpus so the draft can cite real ids:

```ts
import { deriveExcerptIds } from "./ids.ts";

describe("runCli — plan --run", () => {
  async function realIds(): Promise<string[]> {
    const documents = await loadAllDocuments(REPO_ROOT);
    return deriveExcerptIds(buildSourcePack(documents, "module:06-mcp").excerpts);
  }

  it("writes plan.json and a complete manifest", async () => {
    const ids = await realIds();
    const llm = new FakeLlm([{ ...draft, beats: [{ ...draft.beats[0]!, excerptIds: [ids[0]!] }] }]);

    const code = await runCli(base(["--run"]), deps({ llm }));

    expect(code).toBe(0);
    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    expect((await readdir(dir)).sort()).toEqual(["manifest.json", "plan.json"]);
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.status).toBe("complete");
    expect(manifest.cost.estimatedAtMaxOutput).toBeGreaterThan(0);
  });

  it("refuses a second run with the same id rather than overwriting", async () => {
    const ids = await realIds();
    const draftWithIds = { ...draft, beats: [{ ...draft.beats[0]!, excerptIds: [ids[0]!] }] };
    await runCli(base(["--run"]), deps({ llm: new FakeLlm([draftWithIds]) }));

    const llm = new FakeLlm([draftWithIds]);
    const code = await runCli(base(["--run"]), deps({ llm }));

    expect(code).not.toBe(0);
    expect(llm.calls).toHaveLength(0); // refused before the model call
  });

  it("preserves diagnostics when the model returns unusable output", async () => {
    const failing = {
      name: "failing",
      generate: () =>
        Promise.reject(
          new ModelResponseError("the model did not return a value matching the schema", {
            rawText: "Sure! Here is a plan:",
            finishReason: "stop",
          }),
        ),
    };

    const code = await runCli(base(["--run"]), deps({ llm: failing as never }));

    expect(code).not.toBe(0);
    const dir = join(outRoot, "runs", "module-06-mcp", "2026-08-16T13-42-07Z-a3f9c1");
    const failure = JSON.parse(await readFile(join(dir, "failure.json"), "utf8"));
    expect(failure.rawText).toBe("Sure! Here is a plan:");
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.status).toBe("failed");
    expect(manifest.failure.stage).toBe("plan");
  });
});
```

Add `import { buildSourcePack, loadAllDocuments } from "@handbook/content";` to the test imports.

- [ ] **Step 7: Wire the public surface and the example config**

Append to `packages/podcast-engine/src/index.ts`:

```ts
export * from "./config.ts";
export * from "./run.ts";
export * from "./manifest.ts";
export * from "./estimate.ts";
```

`cli.ts` is deliberately **not** exported: it is an entry point, not a library surface.

Create `podcast.config.example.json` at the repository root with the contents of `CONFIG_TEMPLATE` from Task 3.

Append to `.gitignore`:

```text
# Operator configuration and generated episode runs.
podcast.config.json
.podcast/
```

- [ ] **Step 8: Run the full gate**

Run: `pnpm --filter @handbook/podcast-engine test` and record the package total.

Run: `pnpm verify`
Expected: exit 0. **Reconcile the total**: it must equal `190` plus the sum of the counts recorded in Tasks 1–7. Any other number means a task was skipped or a test was dropped — find which before committing.

Lint warnings should still be 29: `cli.ts` prints, and Step 5's exemption is what keeps it from adding more.

- [ ] **Step 9: Format and commit**

```bash
npx prettier --write packages/podcast-engine podcast.config.example.json eslint.config.js
git add packages/podcast-engine podcast.config.example.json .gitignore eslint.config.js
git commit -m "feat(engine): add the podcast CLI, planning for real and refusing to pretend"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: provider-neutral failures → 1; shared request builder and the `planEpisode` change → 2; strict configuration with value bounds, provider literal and language coverage → 3; sanitisation, run ids and atomic reservation → 4; the versioned discriminated-union manifest → 5; the scoped estimate and `estimatedAtMaxOutput` naming → 6; command surface, dry-run semantics, `create` refusal, diagnostics, example config, gitignore and the eslint allowance → 7.

**Run lifecycle.** The spec's five steps appear in `runCli` in order: validate arguments, config, credentials, document and path; reserve; call; failures after reservation write diagnostics and a failed manifest; failures before it write nothing. Four tests assert the last point directly.

**Mutation-sensitive regressions.** Three tests exist specifically because the code passes without them: the token-bound assertion in Task 2 (the bound was advertised and unenforced), the dry-run no-directory assertion in Task 7 (the spec's original wording would have created one), and the config filesystem assertion in Task 3 (an eager check would have killed `plan` on this very checkout).

**Known gaps, deliberate.** No test covers a real provider — that is the opt-in smoke test the spec puts outside the suite, and its purpose is the one thing a fake cannot answer. `create --run` has no success path to test because five stages do not exist.

**Type consistency.** `ModelResponseError` (Task 1) is caught in Task 7. `buildPlanRequest` returns `{ request, excerptIds }` in Task 2 and is destructured that way in Tasks 6 and 7. `PodcastConfig` (Task 3) is consumed in Tasks 5 and 7. `sanitiseSegment`, `makeRunId`, `reserveRunDirectory` (Task 4) are all called in Task 7. `CostBreakdown.estimatedAtMaxOutput` (Task 6) is the field name written into the manifest in Task 7 and validated in Task 5.
