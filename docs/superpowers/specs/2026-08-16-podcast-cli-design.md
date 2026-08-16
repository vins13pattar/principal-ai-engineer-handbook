# Podcast CLI design

Date: 2026-08-16
Status: approved, not implemented
Scope: the operator entry point for the podcast pipeline — `plan` implementable now, `create` specified as the destination

## The distinction this document exists to hold

**A validated plan is not a podcast.** The user-facing completion criterion is a playable audio file, and nothing short of that counts. This matters because the plan stage is the only stage that currently works, and a CLI that succeeds loudly after writing `plan.json` would quietly redefine the goal to whatever happens to be finished.

So the CLI has two commands, and they are not variations of each other. Four invocations, four distinct meanings of success:

| Invocation     | Status               | Success means                                          |
| -------------- | -------------------- | ------------------------------------------------------ |
| `plan`         | Implementable now    | An estimate is printed. Nothing is written             |
| `plan --run`   | Implementable now    | `plan.json` and a complete `manifest.json` written     |
| `create`       | Specified, not built | Refuses, naming the missing stages                     |
| `create --run` | Specified, not built | `episode.wav` is playable and the manifest is complete |

`plan` is a diagnostic milestone: it answers whether a real model, handed a real source pack, returns a draft that satisfies `DraftPlanSchema` and cites excerpt ids that exist. That question has never been answered — every test that exercises `planEpisode`, in `plan.test.ts` and in the live-corpus suite, uses `FakeLlm`. No model that can disagree with this design has ever seen it.

`create` is the product. It is specified here so that `plan` cannot be mistaken for it.

## What exists

ADR-0008 sets the pipeline as source pack → plan → dialogue → review → bounded revision loop → voice script → audio.

- **Source pack** — `@handbook/content`: `loadAllDocuments`, `buildSourcePack`. Works.
- **Plan** — `@handbook/podcast-engine`: `planEpisode`. Works, against fakes only.
- **Providers** — `@handbook/podcast-providers`: `LlmPort`, `createLlm` (OpenAI, Anthropic), `TtsPort`, `createLocalTts`, `PriceList`, `UsageLedger`, `wavDurationSeconds`.
- **Dialogue, review, revision, voice script, assembly** — do not exist.

Local TTS is measured and free to run (Kokoro-82M on an M4: 3.16s fixed + 0.073 × audio seconds). The LLM is not local: `TEXT_PROVIDERS` is `["openai", "anthropic"]`, both hosted and paid. With speech local, **the LLM is the only term that costs money**.

## This spec changes two already-merged packages

Not only additive. The implementation plan must account for it.

**`@handbook/podcast-providers` — `ai-sdk.ts`.** `llmFromModel` currently lets the AI SDK's own error escape. `@handbook/podcast-engine` is forbidden from importing `ai`, so nothing downstream can legally inspect that error to recover the raw model text. The translation has to happen at the only layer allowed to know the SDK exists. See [Provider-neutral failures](#provider-neutral-failures).

**`@handbook/podcast-engine` — `plan.ts`.** `planEpisode` never passes `maxOutputTokens`, and its `SYSTEM` prompt is module-private. Both block an honest estimate. See [The shared request builder](#the-shared-request-builder).

## Command surface

```bash
cli.ts plan   <documentId> --duration <seconds> [--run] [--config <path>] [--out <dir>]
cli.ts create <documentId> --duration <seconds> [--run] [--config <path>] [--out <dir>]
```

Location: **`packages/podcast-engine/src/cli.ts`**. Run from the repository root under `node --experimental-strip-types`, matching `packages/handbook-content/src/cli.ts`. No argument-parsing dependency; `process.argv` directly, as the sibling CLIs do.

A CLI prints, and `no-console` is a warning in this package. Extend the existing `scripts/**` exemption in `eslint.config.js` to `**/src/cli.ts` — narrowly, matching the rule already stated there ("CLI scripts are expected to print to stdout"). Broadening it further would erode a warning count deliberately kept meaningful.

`--duration` is **required and has no configured default**. It is request data — what this episode should be — not a property of the machine, the voice, or the operator's policy. It must parse as a finite number greater than zero; `--duration abc` fails at argument validation, before any file or network access.

### `create` refuses, always

Until the missing stages exist, **both `create` and `create --run` refuse** immediately after argument validation, naming the stages that are absent. It does not estimate.

This is not a limitation to work around — it is the honest behaviour. An estimate for a pipeline whose dialogue, review, and revision stages do not exist would be a number with no method behind it, and the scoping rule in [The spend estimate](#the-spend-estimate) exists precisely to stop partial estimates reading as totals. A refusal that names what is missing is more useful than a figure that cannot be derived.

`create` is present in the surface from the start because a command that names the destination is what stops `plan` being mistaken for the product.

## Configuration

`podcast.config.json` at the repository root, validated with a **strict** Zod schema so a misspelled key fails rather than silently falling back to nothing.

```json
{
  "llm": {
    "provider": "anthropic",
    "modelId": "claude-...",
    "maxOutputTokens": 4000
  },
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
      "args": [
        "-u",
        "runners/kokoro_mlx.py",
        "--text",
        "{text}",
        "--out",
        "{out}",
        "--voice",
        "{voice}",
        "--speed",
        "{speed}",
        "--lang",
        "{language}"
      ],
      "mediaType": "audio/wav",
      "timeoutSeconds": 600
    }
  },
  "plan": {
    "expansionFactor": 3,
    "maxRenderSeconds": 300
  }
}
```

A missing file, or any missing or unrecognised field, prints this template and exits non-zero **before any network call or model construction**.

### Strictness covers keys; the values need their own bounds

`.strict()` rejects a misspelled key. It says nothing about `maxOutputTokens: -1` or `charsPerSecond: 0`, and those reach further before they fail — a zero speech rate divides, a negative token bound is sent to a provider. Every field carries a bound:

| Field                                | Constraint                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `llm.provider`                       | one of `TEXT_PROVIDERS`                                                     |
| `llm.modelId`                        | trimmed, non-empty                                                          |
| `llm.maxOutputTokens`                | integer, positive                                                           |
| `prices.*` (all three)               | finite, non-negative                                                        |
| `tts.provider`                       | `z.literal("local")` — see below                                            |
| `tts.language`                       | one of `ALL_LANGUAGES`, **and** covered by `SPEECH_LANGUAGE_COVERAGE.local` |
| `tts.modelId`, `voice`, `measuredOn` | trimmed, non-empty                                                          |
| `tts.charsPerSecond`                 | finite, positive                                                            |
| `tts.synthesisCost.fixedSeconds`     | finite, positive                                                            |
| `tts.synthesisCost.marginalRtf`      | finite, non-negative                                                        |
| `tts.runner.name`, `command`         | trimmed, non-empty                                                          |
| `tts.runner.args`                    | array of trimmed non-empty strings                                          |
| `tts.runner.timeoutSeconds`          | finite, positive                                                            |
| `plan.expansionFactor`               | finite, positive                                                            |
| `plan.maxRenderSeconds`              | finite, positive                                                            |

These deliberately mirror `assertPlanBudget`, which already enforces the same boundaries at the library edge — including the asymmetry that `fixedSeconds` must be positive because it is a divisor while `marginalRtf` may legitimately be zero. Duplicating them here is not redundancy: it moves the failure from partway through a run to config load, where the message can name the file and the field.

`prices` allows zero because zero is meaningful — it is what a local TTS profile sets, and the number that inverts the cost model.

#### `provider` and `language` need meaning, not just shape

"Trimmed, non-empty" accepts `provider: "banana"` and `language: "elvish"`. Both would pass config load and fail much later, at synthesis, with an error about something else.

- **`provider` is `z.literal("local")`.** It is the only speech provider this configuration can currently construct — `tts.runner` describes a subprocess, and `createLocalTts` is what consumes it. Naming a hosted provider here would describe a profile nothing in this spec can build.
- **`language` must be in `ALL_LANGUAGES`**, and must appear in `SPEECH_LANGUAGE_COVERAGE.local`, which is deliberately narrow: `["en-US", "en-GB"]`. That list's own comment explains why — most small local models are English-only, and the honest default is to claim only what has been listened to. A config asking for `ta-IN` from a local Kokoro profile should fail at load, not produce confident audio in the wrong language, which is precisely the failure `assertSpeakable` exists to prevent at the port boundary.

When a hosted speech provider is wired, `tts` becomes a **discriminated union on `provider`**: the `local` variant keeps `runner`, a hosted variant carries credentials and drops it, and `language` validates against that provider's own coverage entry rather than `local`'s. That is a change to make when there is a second variant to discriminate, not before.

### Why `tts.runner` exists

Provenance alone cannot synthesise anything. `createLocalTts` requires `name`, `command`, and `args`; a block carrying only `provider`, `voice`, and measured constants describes a profile that `create` could never actually run. `runner` mirrors `LocalTtsOptions` exactly — including the `{text}` and `{out}` placeholders the port substitutes, and never through a shell.

The split is deliberate: the fields above `runner` say **what was measured and on what**, and `runner` says **how to reproduce it**. Both are needed, and neither substitutes for the other.

**Path resolution is stated because getting it wrong fails only at synthesis time.** The CLI runs from the repository root, but the Kokoro runner and its virtualenv live under `packages/podcast-providers` — `runners/kokoro_mlx.py` does not resolve from the root, and neither does `.venv/bin/python`. The rule:

- `runner.cwd` is **resolved relative to the repository root**, and is where the subprocess runs.
- `runner.command` and every path inside `runner.args` are **relative to `runner.cwd`**, matching how `createLocalTts` already passes `cwd` to `spawn`.
- `cwd` is optional; omitted, the subprocess inherits the repository root.

**Filesystem checks are deliberately not part of config loading.** Splitting them is the difference between a working `plan` and a dead one:

| When                     | Checks                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Config load              | Structure, types, and numeric bounds only. No filesystem access                                                |
| `create --run` preflight | `cwd` exists, `command` resolves to an executable, runner paths resolve — **before the first paid model call** |
| `create` (refusing)      | Never reaches preflight                                                                                        |

The earlier draft of this spec had config load verify the runner executable. On this checkout that is fatal: `packages/podcast-providers/.venv/bin/python` does not exist, so **both `plan` and `plan --run` would have failed at config load** over a synthesis binary neither command uses. A machine that plans is not necessarily a machine that renders, and the config is one file shared by both.

Preflight belongs to `create --run` specifically, and must run _before_ the model call rather than after: discovering a missing runner once the dialogue stage has been paid for is the expensive ordering.

### Why the profile carries provenance

`charsPerSecond: 16.2` is not a property of speech. It is a property of Kokoro-82M bf16 speaking `af_heart` in `en-US` on an M4. The same is true of `synthesisCost`. Stripped of `provider`, `modelId`, `voice`, `language`, and `measuredOn`, those numbers keep being applied after the thing they measured has changed, and every duration and render projection downstream inherits the error silently.

`speechPerMillionCharacters: 0` states that synthesis is local rather than leaving it assumed.

### Prices

`prices` is the existing `PriceList` from `cost.ts`, verbatim and required. That module's reasoning applies unchanged: a stale hardcoded rate produces confident wrong numbers — worse than no number, since it stops the question being asked.

### Credentials

`PODCAST_LLM_API_KEY` is read from the environment and **required only under `--run`**. The estimate path builds the pack, derives ids, constructs the request, and reports cost with no credential present, so it runs in CI or for someone without a key.

Optional `CF_ACCOUNT_ID` and `CF_GATEWAY_NAME` route through Cloudflare AI Gateway, matching the existing two-environment-variable story in `registry.ts`.

Secrets never go in `podcast.config.json`. A config file inside a repository is exactly where a key gets committed by accident.

## The shared request builder

`plan.ts` gains an exported builder, and `planEpisode` is changed to use it:

```ts
export function buildPlanRequest(
  pack: SourcePack,
  options: { maxOutputTokens: number },
): { request: StructuredRequest<DraftPlan>; excerptIds: string[] };
```

**The builder derives the ids; it does not accept them.** Returning `{ request, excerptIds }` and reusing that array for `validateCitations` and `apportion` means there is exactly one derivation per run and no way for a caller to pair a prompt with ids from a different array.

Taking ids as a parameter would have reintroduced an unchecked parallel-array contract at a new site. `renderPrompt` skips an excerpt whose position has no entry rather than failing, so a length mismatch there produces a prompt missing excerpts, a model that cannot cite what it never saw, and a citation error that names the model rather than the caller. `apportion` already asserts this invariant — that guard was added during implementation review precisely because silent under-allocation is undetectable downstream — and there is no reason to create a second place where it can go wrong.

The returned request is complete: `schema`, `system`, `prompt`, and `maxOutputTokens`. `planEpisode` calls it; the estimator calls it. One construction, two readers.

This fixes two defects at once:

- **The advertised bound was unenforceable.** `planEpisode` never passed `maxOutputTokens` to `generate`, so an estimate claiming a maximum output cost was claiming a limit nothing imposed. `LlmPort` has always accepted the field; the plan stage simply never set it.
- **The estimate would have measured the wrong prompt.** `SYSTEM` is module-private, so an estimator outside `plan.ts` could only duplicate it — and a duplicate drifts, leaving the estimate priced against text the model never receives.

`planEpisode`'s signature takes the token bound explicitly rather than defaulting it, consistent with every other number in this pipeline.

## Provider-neutral failures

`llmFromModel` catches the AI SDK's `NoObjectGeneratedError` and rethrows an exported, provider-neutral error:

```ts
export class ModelResponseError extends Error {
  readonly rawText?: string;
  readonly usage?: Usage;
  readonly finishReason?: string;
}
```

Only those fields cross the boundary. **The provider error object, its headers, its stack, and anything carrying credentials are never attached and never serialised.** An error written into a run directory is an artifact that gets shared; a leaked `authorization` header in one is a credential disclosure.

Without this, the CLI cannot diagnose the single most likely first-contact failure — a model returning prose instead of schema-valid JSON — because recognising that error means importing `ai`, which the engine package is forbidden to do. The rule is not bureaucratic here: it is the reason the translation belongs in the one file that already imports the SDK.

## The spend estimate

An estimate that reports one number, or that omits stages it cannot price, is worse than none: it invites a decision on a figure whose shape is not what the reader assumes. So the estimate is a **scoped breakdown that names what it covers** — "bounded" would claim the thing rule 1 says it is not.

**A dry run writes nothing.** It prints the breakdown to stdout and exits zero. No run directory is created, no `plan.json`, no manifest. There is no manifest variant for it because there is nothing to record: no `EpisodePlan` was produced, no model was called, no usage exists, and a directory holding only an estimate would be an artifact implying work that did not happen. Under `--run`, the directory is reserved before the model call — see [Run lifecycle](#run-lifecycle).

```text
$ cli.ts plan module:06-mcp --duration 2400

  pack            24 excerpts, ~18,400 est. input tokens
  model           anthropic:claude-...

  input (est.)    ~18,400 tok   $0.055   estimated, NOT capped
  output (cap)      4,000 tok   $0.060   enforced via maxOutputTokens
  ────────────────────────────────────
  estimated at max output       $0.115

  input is an approximation and can exceed this; only output is capped

  covers          plan only
  excludes        dialogue, review, revision, voice script, synthesis
                  — these stages are not implemented, and are not priced here

  (estimate only — pass --run to call the model)
```

Five rules govern it:

1. **The total is not an upper bound, and must not be named one.** It is `estimatedAtMaxOutput` — in the report and in the manifest field. Only the output side is capped. The input side is an estimate that can be exceeded, for two independent reasons: `estimateTokens` is documented as deliberately crude at four characters per token, and structured-output calls send the JSON schema as part of the request, framing that a character count of the prompt string never sees. Calling the sum a guaranteed spending limit would be the exact failure this whole section exists to prevent — a figure whose shape is not what the reader assumes.
2. **Input is estimated from the exact request that will be sent** — the one `buildPlanRequest` returns, system prompt included. The report says "estimated", never "measured", and says outright that it is not capped.
3. **Output is reported as a maximum**, and that maximum is _enforced_ by the same `maxOutputTokens` the request carries. A bound that is reported but not applied is not a bound.
4. **Speech is not part of a `plan` estimate at all.** `plan` does not synthesise, so pricing synthesis into its total would put dollars on work the command never performs — visibly wrong the moment a hosted TTS profile is configured. Speech is priced only under `create`, from `plannedSeconds × tts.charsPerSecond` at `prices.speechPerMillionCharacters`. A `plan` run may print it as a clearly separated _excluded_ projection; it never enters the total.
5. **The report names which stages it covers and which it excludes**, and says the excluded ones are not implemented. Omitting that turns a partial estimate into an apparent total.

A genuine ceiling would need a provider-accurate input count — the vendor's own tokeniser, applied to the serialised request including schema framing. That is available, and worth doing if this number is ever used to authorise spend rather than to inform it. Until then the honest move is the name.

After a `--run`, the breakdown is reprinted with measured usage from `LlmResult` beside the estimate, so the estimate's accuracy is observable rather than assumed.

## Output

```text
<out>/<sanitised-document-id>/<run-id>/
```

`--out` replaces the **root** only; the document and run-id segments are always appended. Default root is `.podcast`.

### Sanitisation

Algorithmic, not by example:

1. NFKC normalise.
2. Replace every character outside `[A-Za-z0-9._-]` with `-`.
3. Collapse runs of `-` and trim leading and trailing `-`.
4. **Reject** — do not repair — a result that is empty, `.`, or `..`.

Step 2 handles path separators by construction: `/` and `\` are outside the allowed set and become `-`, so a sanitised segment can never escape its parent. Step 4 exists because `.` and `..` survive step 2 unchanged and are the two names that traverse rather than nest.

`module:06-mcp` → `module-06-mcp`.

### Run ids

`<run-id>` is an ISO-8601 UTC timestamp with colons replaced, plus a short random suffix: `2026-08-16T13-42-07Z-a3f9c1`.

The suffix is not decoration. Second-resolution timestamps collide, and combined with the never-overwrite rule below a collision would surface as a spurious refusal — the safety rule appearing to misfire. **The clock and the id generator are injected**, so tests can assert both collision handling and directory naming without sleeping or accepting non-determinism.

### Never overwrite

An existing run directory is never overwritten. The command refuses and names the path. Runs are evidence; silently replacing one destroys the artifact someone is comparing against.

### `plan` writes nothing; `plan --run` writes two files

```text
plan.json        the EpisodePlan
manifest.json    see below
```

A dry run creates no directory at all. Under `--run` the directory is reserved **after pre-call validation and before the model call** — see [Run lifecycle](#run-lifecycle).

## Run lifecycle

Directory creation has exactly one defined point, because two plausible ones contradict each other: reserving _after_ the model returns leaves nowhere to write `failure.json` when the model returns unusable output, and reserving at process start creates directories for invocations that never had a chance of running.

Under `--run`, in order:

1. **Validate** arguments, config, credentials, the document id, and the sanitised path.
2. **Reserve** the run directory, atomically. A collision refuses here — before any model call, so a name clash never costs money.
3. **Call** the model.
4. **Every failure from this point writes diagnostics and a failed manifest** into the reserved directory: `failure.json` carrying the `ModelResponseError` fields, and a manifest with `status: "failed"`.
5. **Every failure before step 2 writes nothing** — no directory, no manifest. There is nowhere to put one, and creating a directory to record that the run never started would be an artifact of an event that produced no work.

Reservation is atomic — `mkdir` with `recursive: false` on the leaf, which fails rather than succeeding silently if the path already exists. This is what makes step 2's collision check a check rather than a race.

A dry `plan` never reaches step 2.

### `create` must write

```text
plan.json
transcript.json
review.json
voice-script.json
episode.wav
manifest.json
```

**No empty placeholders.** A zero-byte `episode.wav` is worse than an absent one: it satisfies a file-exists check while being unplayable, which is the precise failure mode this project keeps designing against. A stage that has not run writes nothing.

## The manifest

Versioned and Zod-validated **before** it is written, because it is the file that declares a run complete and the one most likely to be parsed by something later.

**A Zod discriminated union on `status`**, not a flat object with an optional `failure`. A flat shape admits both `complete` carrying a failure and `failed` carrying none — two states that should be unrepresentable in the one file whose job is to say which happened.

Common to both variants:

```ts
{
  manifestVersion: 1,
  command: "plan" | "create",
  documentId: string,
  runId: string,
  startedAt: string,          // ISO-8601 UTC
  finishedAt: string,
  request: { durationSeconds: number },
  resolvedConfig: {           // non-secret only; never the API key
    llm: { provider, modelId, maxOutputTokens },
    prices: PriceList,
    tts: { provider, modelId, voice, language, measuredOn,
           charsPerSecond, synthesisCost, runner: { name, cwd?, command, args, ... } },
    plan: { expansionFactor, maxRenderSeconds },
  },
  artifacts: string[],        // files actually written, relative to the run dir
}
```

`status: "complete"` **requires** everything a finished run necessarily produced, and **forbids** `failure`:

```ts
{
  status: "complete",
  source: { sourceHash: string, excerptCount: number, droppedForBudget: string[] },
  model: { modelId: string },
  usage: Usage,
  cost: { estimatedAtMaxOutput: number, measured: number },
}
```

`status: "failed"` **requires** `failure`, and makes those four optional — because a run can fail before any of them exists:

```ts
{
  status: "failed",
  failure: { stage: string, message: string },
  source?: ...,   // absent when the failure preceded pack loading
  model?: ...,    // absent when no provider was constructed
  usage?: ...,    // absent when no call was made
  cost?: { estimatedAtMaxOutput: number, measured: number | null },
}
```

**Which fields may be absent is a function of where the run died**, and the boundaries are worth naming:

Every row here is a failure **after** the directory was reserved, because those are the only failures that produce a manifest at all:

| Failure point                           | `source` | `model` | `usage`                           | `cost`                      |
| --------------------------------------- | -------- | ------- | --------------------------------- | --------------------------- |
| Model call failed (schema, citations)   | present  | present | present when the error carried it | `measured` when usage known |
| Synthesis or assembly failed (`create`) | present  | present | present                           | present                     |

Argument validation, config validation, a missing credential, and an unknown document id are **not** in this table. They all occur before step 2 of the [Run lifecycle](#run-lifecycle), so there is no directory and no manifest — listing them as manifest states would describe files that never exist.

There is likewise no row for "estimate produced, call not made". That is a dry run: a success that writes nothing, not a failed run missing its fields.

`artifacts` lists what was written rather than what was expected — the difference between the two is what makes a failed run legible.

Validation before writing is the point: a manifest that fails its own schema must not reach disk, because a malformed manifest is indistinguishable from a missing one to anything reading it, and a run with no manifest is a run whose status is unknown.

## The `create` success contract

A `create --run` succeeds **only when both** hold:

1. **`episode.wav` is playable.** Defined concretely: `wavDurationSeconds` — already in `podcast-providers`, already tested — returns non-null for the file's bytes, and the duration is greater than zero. A file that does not parse as RIFF/WAVE, or parses to zero duration, is not a podcast.
2. **`manifest.json` records `status: "complete"`**, written last, after the audio has been verified.

Anything else is a failed run. Failed runs **may and should preserve diagnostics** — partial artifacts, `failure.json` carrying the `ModelResponseError` fields, the error message — because that is what makes them debuggable. They must not look complete:

- `manifest.json` records `status: "failed"` with the stage that failed and why.
- The command exits non-zero.
- No file is written that implies a stage produced output it did not.

## Failure handling

| Failure                                                | Behaviour                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Bad arguments (`--duration` missing, non-numeric, ≤ 0) | Fail at argument validation, before any file or network access                                              |
| Config missing, malformed, or with an unrecognised key | Print the template, exit non-zero, before any network call                                                  |
| `PODCAST_LLM_API_KEY` absent under `--run`             | Fail before building the pack or constructing a provider                                                    |
| Unknown document id                                    | `buildSourcePack` already throws naming the id and the expected shape                                       |
| Document id sanitises to empty, `.`, or `..`           | Refuse, naming the id                                                                                       |
| Model returns prose or schema-invalid JSON             | `ModelResponseError` carries `rawText`; write it to `failure.json`, mark the manifest failed, exit non-zero |
| Invented excerpt citations                             | `validateCitations` throws naming the invented ids; same diagnostic path                                    |
| Run directory exists                                   | Refuse at reservation, naming the path — before the model call, so a collision never costs money            |
| `create` or `create --run` invoked                     | Refuse immediately after argument validation, naming the missing stages                                     |

## Testing

**Only the live-provider call needs a network.** Everything else is testable offline with `FakeLlm` and injected dependencies, and must be. The offline suite covers:

- argument parsing, including `--duration` rejection and the `--out` root substitution;
- config validation — missing field fails, unrecognised field fails (the assertion that proves strict mode is on), valid config parses;
- credential refusal under `--run` with no key, asserting **zero** `FakeLlm` calls;
- request construction via `buildPlanRequest`, asserting the system prompt is present;
- **token-bound propagation** — the `maxOutputTokens` from config reaches `StructuredRequest`, which is the assertion that makes the advertised bound real;
- provider injection — the CLI accepts an `LlmPort` so the whole `--run` path runs against `FakeLlm`;
- successful artifact writing — `plan.json` and `manifest.json` present, manifest `status: "complete"`, `artifacts` matching what is on disk;
- schema-failure diagnostics — a `ModelResponseError` produces `failure.json` with `rawText` and a failed manifest, and **no** provider internals, headers, or credentials in the written file;
- no-overwrite behaviour, using an injected clock and id generator to force a collision deterministically;
- sanitisation, including the empty/`.`/`..` rejections;
- cost-breakdown arithmetic, including that speech contributes nothing to a `plan` total, and that the reported field is named `estimatedAtMaxOutput` rather than an upper bound;
- manifest variants — a `complete` manifest carrying a `failure` fails validation, and so does a `failed` one without it;
- runner path resolution — `command` and `args` resolve against `runner.cwd`, and `cwd` against the repository root;
- config value bounds — `maxOutputTokens: 0`, a negative price, `charsPerSecond: 0`, and `fixedSeconds: 0` each fail at config load with the field named;
- **a dry `plan` creates no directory** — assert the output root is untouched afterwards, and that `FakeLlm` recorded zero calls;
- **every pre-reservation failure leaves the output root untouched** — bad `--duration`, invalid config, missing credential under `--run`, and unknown document id each assert the root is unchanged and no manifest exists;
- **a schema failure preserves its diagnostics** — `failure.json` present with `rawText`, manifest present with `status: "failed"`, exit non-zero, and the directory reserved before the call rather than after it;
- **config load performs no filesystem check on the runner** — a config naming a `command` that does not exist still loads, and `plan --run` completes against `FakeLlm`, which is the regression that would otherwise make `plan` unusable on a machine without the synthesis venv;
- `tts.provider` other than `"local"` fails; `tts.language` outside `ALL_LANGUAGES` fails; a language valid in `ALL_LANGUAGES` but outside `SPEECH_LANGUAGE_COVERAGE.local` (`ta-IN`) fails;
- the playable predicate — valid WAV passes; empty bytes, truncated header, and zero-sample WAV all fail;
- `create` refusing both with and without `--run`.

Outside the normal suite: **one opt-in real-provider smoke test**, run deliberately with a credential present, whose purpose is the one thing a fake cannot answer — what a real model actually returns.

## Scope of the first implementation

- `buildPlanRequest` and the `planEpisode` change — `@handbook/podcast-engine`.
- `ModelResponseError` and the `llmFromModel` translation — `@handbook/podcast-providers`.
- `plan` — fully implemented, estimate and `--run`.
- `create` — present, refuses, names the missing stages.
- `podcast.config.example.json` — committed.
- `.gitignore` — adds `podcast.config.json` and `.podcast/`.
- `eslint.config.js` — `**/src/cli.ts` added to the existing console allowance.

## Out of scope

- **Dialogue, review, revision, voice script, and assembly.** Each is its own design.
- **A local LLM.** `createLlm` builds hosted providers only. Adding one is a separate decision.
- **Resuming a partial run.** Runs are cheap at the plan stage. Revisit when a full `create` run is expensive enough that discarding one hurts.
