# Podcast CLI design

Date: 2026-08-16
Status: approved, not implemented
Scope: the operator entry point for the podcast pipeline — `plan` implementable now, `create` specified as the destination

## The distinction this document exists to hold

**A validated plan is not a podcast.** The user-facing completion criterion is a playable audio file, and nothing short of that counts. This matters because the plan stage is the only stage that currently works, and a CLI that succeeds loudly after writing `plan.json` would quietly redefine the goal to whatever happens to be finished.

So the CLI has two commands, and they are not variations of each other:

| Command  | Status               | Success means                                          |
| -------- | -------------------- | ------------------------------------------------------ |
| `plan`   | Implementable now    | `plan.json` and `manifest.json` written                |
| `create` | Specified, not built | `episode.wav` is playable and the manifest is complete |

`plan` is a diagnostic milestone: it answers whether a real model, handed a real source pack, returns a draft that satisfies `DraftPlanSchema` and cites excerpt ids that exist. That question has never been answered — every test that exercises `planEpisode`, in `plan.test.ts` and in the live-corpus suite, uses `FakeLlm`. No model that can disagree with this design has ever seen it.

`create` is the product. It is specified here so that `plan` cannot be mistaken for it.

## What exists

ADR-0008 sets the pipeline as source pack → plan → dialogue → review → bounded revision loop → voice script → audio.

- **Source pack** — `@handbook/content`: `loadAllDocuments`, `buildSourcePack`. Works.
- **Plan** — `@handbook/podcast-engine`: `planEpisode`. Works, against fakes only.
- **Providers** — `@handbook/podcast-providers`: `LlmPort`, `createLlm` (OpenAI, Anthropic), `TtsPort`, `createLocalTts`, `PriceList`, `UsageLedger`, `wavDurationSeconds`.
- **Dialogue, review, revision, voice script, assembly** — do not exist.

Local TTS is measured and free to run (Kokoro-82M on an M4: 3.16s fixed + 0.073 × audio seconds). The LLM is not local: `TEXT_PROVIDERS` is `["openai", "anthropic"]`, both hosted and paid. With speech local, **the LLM is the only term that costs money** — the minority term at 13% when audio was premium-priced, now effectively all of a small number.

## Command surface

```bash
cli.ts plan   <documentId> --duration <seconds> [--run] [--config <path>] [--out <dir>]
cli.ts create <documentId> --duration <seconds> [--run] [--config <path>] [--out <dir>]
```

Run from the repository root under `node --experimental-strip-types`, matching `packages/handbook-content/src/cli.ts`. No argument-parsing dependency; `process.argv` directly, as the sibling CLIs do.

`--duration` is **required and has no configured default**. It is request data — what this episode should be — not a property of the machine, the voice, or the operator's policy. The spec for the plan stage already separates those categories, and putting `requestedSeconds` in a config file would collapse the distinction.

Without `--run`, both commands estimate and stop. This is the default because the alternative establishes a habit on the stage where being wrong costs pennies, and carries it into the dialogue stage where the revision loop multiplies it.

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
    "synthesisCost": { "fixedSeconds": 3.16, "marginalRtf": 0.073 }
  },
  "plan": {
    "expansionFactor": 3,
    "maxRenderSeconds": 300
  }
}
```

A missing file, or any missing or unrecognised field, prints this template and exits non-zero **before any network call or model construction**.

### Why the TTS block carries provenance

`charsPerSecond: 16.2` is not a property of speech. It is a property of Kokoro-82M bf16 speaking `af_heart` in `en-US` on an M4. The same is true of `synthesisCost`. Recorded without `provider`, `modelId`, `voice`, `language`, and `measuredOn`, those numbers become floating constants that keep being applied after the thing they measured has changed — and every duration and render projection downstream inherits the error silently.

`speechPerMillionCharacters: 0` states that synthesis is local rather than leaving it to be assumed. It is the number that inverted the cost model, so it is stated, not defaulted.

### Prices

`prices` is the existing `PriceList` from `cost.ts`, verbatim and required. That module's reasoning applies unchanged: prices are configuration, not constants, because a stale hardcoded rate produces confident wrong numbers — worse than no number, since it stops the question being asked.

### Credentials

`PODCAST_LLM_API_KEY` is read from the environment and **required only under `--run`**. The estimate path builds the pack, derives ids, renders the prompt, and reports cost with no credential present, so it runs in CI or for someone without a key.

Optional `CF_ACCOUNT_ID` and `CF_GATEWAY_NAME` route through Cloudflare AI Gateway, matching the existing two-environment-variable story in `registry.ts`.

Secrets never go in `podcast.config.json`. A config file inside a repository is exactly where a key gets committed by accident.

## The spend estimate

An estimate that reports one number, or that omits stages it cannot price, is worse than none: it invites a decision on a figure whose shape is not what the reader assumes. So the estimate is a **bounded breakdown, and it names its own scope**.

```text
$ cli.ts plan module:06-mcp --duration 2400

  pack            24 excerpts, ~18,400 est. input tokens
  model           anthropic:claude-...

  input           ~18,400 tok   $0.055   (estimated from the exact prompt)
  output (max)      4,000 tok   $0.060   (bounded by llm.maxOutputTokens)
  speech                    —   $0.000   (not run by `plan`)
  ────────────────────────────────────
  upper bound                   $0.115

  covers          plan only
  excludes        dialogue, review, revision, voice script, synthesis
                  — these stages are not implemented

  (estimate only — pass --run to call the model)
```

Four rules govern it:

1. **Input is estimated from the exact prompt that will be sent**, not from a guess about the pack. It is still an estimate: `estimateTokens` is documented as deliberately crude at four characters per token, and the true count arrives only in `LlmResult.usage`. The report says "estimated", not "measured".
2. **Output is unknown before the call, so it is reported as a maximum**, bounded by the required `llm.maxOutputTokens`. This is why that field is required rather than optional — without a bound, there is no upper bound to report, and an estimate without one is a lower bound wearing an estimate's clothing.
3. **Speech is priced from `plan.requestedSeconds × tts.charsPerSecond`** as a maximum character count, at `prices.speechPerMillionCharacters`. For a local profile this is exactly zero, which is the point: the zero should be visible and attributable, not absent.
4. **The report names which stages it covers and which it excludes.** A `plan` estimate must state explicitly that it excludes dialogue, review, revision, and synthesis, and that those stages are not implemented. Omitting that turns a partial estimate into an apparent total.

After a `--run`, the same breakdown is reprinted with measured usage from `LlmResult` beside the estimate, so the estimate's accuracy is observable rather than assumed.

## Output

A run directory per invocation:

```text
.podcast/<sanitised-document-id>/<run-id>/
```

`module:06-mcp` sanitises to `module-06-mcp`. Colons are illegal in Windows paths and awkward in every shell. `<run-id>` is an ISO-8601 UTC timestamp with colons replaced, e.g. `2026-08-16T13-42-07Z`.

**An existing run directory is never overwritten.** The command refuses and names the path. Runs are evidence; silently replacing one destroys the artifact someone is comparing against.

### `plan` writes

```text
plan.json        the EpisodePlan
manifest.json    resolved non-secret configuration, source hash, model id, usage, measured cost
```

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

## The `create` success contract

A `create --run` succeeds **only when both** hold:

1. **`episode.wav` is playable.** Defined concretely rather than aspirationally: `wavDurationSeconds` (already in `podcast-providers`, already tested) returns non-null for the file's bytes, and the duration is greater than zero. A file that does not parse as RIFF/WAVE, or that parses to zero duration, is not a podcast.
2. **`manifest.json` records `status: "complete"`**, and it is written last, after the audio has been verified.

Anything else is a failed run. Failed runs **may and should preserve diagnostics** — the partial artifacts, the raw model response, the error — because that is what makes them debuggable. They must not look complete:

- `manifest.json` records `status: "failed"` with the stage that failed and why.
- The command exits non-zero.
- No file is written that implies a stage produced output it did not.

The manifest is the only thing that declares a run complete, and it is written once, at the end, from verified facts.

## Failure handling

| Failure                                                | Behaviour                                                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config missing, malformed, or with an unrecognised key | Print the template, exit non-zero, before any network call                                                                                                                        |
| `PODCAST_LLM_API_KEY` absent under `--run`             | Fail before building the pack or constructing a provider                                                                                                                          |
| Unknown document id                                    | `buildSourcePack` already throws naming the id and the expected shape                                                                                                             |
| Model response fails `DraftPlanSchema`                 | The AI SDK error carries the raw model text; write it to the run directory as `failure.json` and mark the manifest failed. Without the raw response this failure is undiagnosable |
| Invented excerpt citations                             | `validateCitations` throws naming the invented ids; same diagnostic path                                                                                                          |
| Run directory exists                                   | Refuse, naming the path                                                                                                                                                           |
| `create` invoked                                       | Exit non-zero naming the missing stages, until they exist                                                                                                                         |

`create` is present in the command surface from the start, and refuses. That is deliberate: a command that names the destination and explains what is missing is what stops `plan` being mistaken for the product.

## Testing

No network in any test, matching the rest of the repository.

Pure and unit-tested:

- **Config validation** — a missing field fails; an unrecognised field fails (this is what strict mode buys, and it is the assertion that proves strictness is on); a valid config parses to the expected shape.
- **Filename sanitisation** — `module:06-mcp` → `module-06-mcp`; a run id contains no colon.
- **Cost breakdown arithmetic** — input estimate, output maximum, speech maximum, and the upper bound as their sum; a local TTS profile produces exactly zero speech cost.
- **The playable check** — a valid WAV passes; zero-length bytes, a truncated header, and a valid header with no samples all fail. `wavDurationSeconds` already has tests; this covers the predicate built on it.

Not unit-tested, and stated rather than hidden: the `--run` path itself. It requires a network and a credential, and its purpose is to discover what a real model does — which is the one thing a test with a fake cannot tell us.

## Scope of the first implementation

- `plan` — fully implemented, both estimate and `--run`.
- `create` — present, refuses with a message naming the missing stages.
- `podcast.config.example.json` — committed.
- `.gitignore` — adds `podcast.config.json` and `.podcast/`.

## Out of scope

- **Dialogue, review, revision, voice script, and assembly.** Each is its own design.
- **A local LLM.** `createLlm` builds hosted providers only. Adding one is a separate decision, not a CLI concern.
- **Resuming a partial run.** Runs are cheap at the plan stage. Revisit when a full `create` run is expensive enough that discarding one hurts.
