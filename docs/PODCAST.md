# Podcast engine

Turns one handbook page into a two-voice podcast episode. The model plans the arc and writes the
dialogue; a local text-to-speech model speaks it; the pipeline joins the segments into one file.

Speech is local and therefore free. The only money this spends is on the language model — **$0.46
for a five-minute episode** at Claude Sonnet pricing, or **$0.21 with `--skip-review`**. Input
dominates: the plan call sends the whole page, and review reads each beat's excerpts a second time.

Six stages: plan, dialogue, review, revision, synthesis, assembly.

## Layout

```text
packages/handbook-content/     Loads pages, builds the SourcePack an episode is sourced from
packages/podcast-providers/    LlmPort and TtsPort, the adapters behind them, WAV assembly
packages/podcast-engine/       Planner, dialogue, review, trim, synthesis, manifests, the CLI
```

The engine never imports `ai` or `@ai-sdk/*`. It imports `LlmPort` and `TtsPort`, and everything
vendor-specific lives behind those two shapes — see
[ADR-0008](https://github.com/vins13pattar/principal-ai-engineer-handbook/blob/main/apps/handbook/src/content/docs/adr/decisions/0008-typescript-podcast-pipeline.mdx).
That is what makes the pipeline testable without a network or an API key.

## Setup

### 1. The synthesis runner

Speech runs locally through [Kokoro-82M](https://huggingface.co/mlx-community/Kokoro-82M-bf16) on
mlx-audio, which needs a Python virtualenv inside the providers package and Apple silicon:

```bash
cd packages/podcast-providers && uv venv && uv pip install mlx-audio "misaki[en]"
```

### 2. espeak-ng, and the workaround it needs

```bash
brew install espeak-ng
```

This step is not optional and not obvious. `espeakng-loader` (0.2.0 through 0.2.4, all of them)
ships a dylib that ignores the data path passed to `espeak_Initialize` and hard-exits on the path
baked in at its build — `/Users/runner/work/espeakng-loader/...`. It is not a phonemizer bug; a bare
ctypes call reproduces it. Point the loader at a real espeak-ng instead:

```bash
cd packages/podcast-providers/.venv/lib/python3.13/site-packages/espeakng_loader
mv libespeak-ng.dylib libespeak-ng.dylib.broken
mv espeak-ng-data espeak-ng-data.broken
ln -s /opt/homebrew/lib/libespeak-ng.dylib libespeak-ng.dylib
ln -s /opt/homebrew/share/espeak-ng-data espeak-ng-data
```

Check it works before spending anything on a model. The first call downloads the model and a spaCy
package, so it takes about 35 seconds; a warm call is under four:

```bash
cd packages/podcast-providers && .venv/bin/python runners/kokoro_mlx.py --text "Testing one two three." --out /tmp/smoke.wav
```

### 3. Configuration

```bash
cp podcast.config.example.json podcast.config.json
```

`podcast.config.json` is gitignored; the example is committed. Set `llm.modelId` to a real model.
Every other value in the example is measured on an Apple M4 and explained below.

### 4. The credential

`PODCAST_LLM_API_KEY` is required only with `--run`. Estimates work without it, which is what keeps
`plan` usable in CI and on a machine with no key. Keep it out of the repo — a file outside the tree
read with `node --env-file` works:

```bash
node --env-file=~/.config/handbook/podcast.env --experimental-strip-types packages/podcast-engine/src/cli.ts plan module:06-mcp --duration 300
```

## Commands

Both take a document id and a duration in seconds, and both print an estimate and exit without
spending unless you pass `--run`.

```bash
# What a plan call would cost, and whether the page supports an episode at all.
node --experimental-strip-types packages/podcast-engine/src/cli.ts plan module:06-mcp --duration 300

# The whole pipeline: plan, dialogue, review, revision, synthesis, assembly.
node --env-file=... --experimental-strip-types packages/podcast-engine/src/cli.ts create module:06-mcp --duration 300 --run
```

| Flag            | Default               | Meaning                                                    |
| --------------- | --------------------- | ---------------------------------------------------------- |
| `--duration`    | required              | Seconds of speech to aim for                               |
| `--run`         | off                   | Actually call the model. Without it, nothing is written    |
| `--config`      | `podcast.config.json` | Configuration path                                         |
| `--out`         | `.podcast`            | Where run directories are created                          |
| `--skip-review` | off                   | Skip the groundedness check. Halves the cost and the calls |

`plan` exists separately because it is the cheap half — one model call, no synthesis — and the half
worth running when the question is whether the source material supports an episode.

## What a run writes

Each run gets its own directory, `.podcast/<document>/<timestamp>-<suffix>/`, reserved atomically so
two runs can never share one:

| File            | Contents                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| `plan.json`     | The arc: beats, citations, per-beat seconds, what the model could not source    |
| `script.json`   | Every turn the model wrote, including the ones the trim did not render          |
| `episode.wav`   | The episode                                                                     |
| `manifest.json` | Status, model, usage, measured cost, which turns were cut, every review finding |
| `failure.json`  | Only on failure: the model's raw text and finish reason                         |

`script.json` holds what the model wrote **after revision but before trimming**, and the manifest
names the turn indices that were not spoken — so both edits the pipeline makes to its own output are
auditable rather than invisible.

A failed run still writes a manifest with everything spent up to the failure. A run that dies in
synthesis has already paid for its model calls, and a manifest reporting zero for them would
understate the bill.

## The measured numbers

Three configuration values are measurements, not preferences. Re-measure them on different hardware
or a different voice.

**`tts.charsPerSecond: 14.47`** — the speaking rate, and the number that decides whether "five
minutes" means five minutes. Pooled over five real episodes and 22,349 characters, with per-episode
rates from 13.96 to 15.28. Measure it on dialogue rather than prose: an early benchmark read one
paragraph straight through and got 16.2, and using that figure made a 300-second request produce 513
seconds of audio. The ±5% spread is why a request lands _near_ its duration rather than on it.

**`tts.synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0.073 }`** — render time is
`fixed + marginal × audioSeconds`, **per call**. The fixed term is model load, and it is paid per
segment rather than per episode, which is why segment count is a planning decision and not a tuning
detail. A five-minute episode renders in about a minute on an M4.

**`llm.maxOutputTokens: 16000`** — a ceiling, and ceilings only cost when hit. Two early runs died on
truncation at 4000 and 8000, each wasting a full pair of calls.

## Why length is enforced rather than requested

The model will not hit a length target by instruction. Asked three different ways — a character
budget, that budget with an explicit ten-percent tolerance, and a turn count — it overran by 48%,
57% and 96%. The overrun got _worse_ as the instruction got more precise, because a model cannot
count the characters it is emitting.

So the model decides what the episode says and in what order, and `trimToBudget` decides how much
gets spoken. It cuts beat by beat rather than over the flat list, since a flat trim takes the ending
off — the close is the last thing written and the first thing a length cut reaches. Every beat keeps
its first turn, so no beat the planner asked for vanishes silently.

Dialogue is generated one call per beat for the same reason. A single whole-episode call could not
be bounded, and it was more expensive: a beat needs the excerpts it cites, not the whole
24,500-token pack, so five small calls send less than one large one.

## What review is for

Groundedness is the promise the closed-set design makes, and until review existed the only stage
checking it was the planner. `validateCitations` proves a beat cites real excerpt ids; nothing
proved the dialogue written from those excerpts stayed inside them. A confident sentence the sources
do not support is indistinguishable from a correct one at every later stage, and it is spoken in the
same voice.

Each beat is checked against its own excerpts, and revised only if something was found — so a clean
beat costs one extra call and a clean episode costs nothing to fix. Three problems are looked for,
and they are the three this pipeline actually produces:

- **`unsupported`** — the closed-set promise, broken. On the first reviewed run the guest said a
  compromised server affects "not the other nine you've got open", inventing a number that appears
  nowhere in the sources.
- **`repeats`** — per-beat generation's own failure mode. No call sees another call's text, so the
  same explanation can arrive twice, and a later beat can refer back to something never said. The
  same run had a host recall "a third trap earlier, with credentials" that no earlier turn mentioned.
- **`unspeakable`** — `tools/call`, `_meta`, `create_pull_request`, `ttlMs`. Harmless on a page and
  gibberish in an ear.

That first reviewed run found six problems across five beats with no false positives, and roughly
doubled the cost: **$0.46 against $0.21**. `--skip-review` turns it off; the manifest records
`ran: false` rather than an empty finding list, because "nobody checked" and "checked and clean" are
different claims.

## Known limits

- **Length lands within about 10%, not exactly.** Trimming can only cut on turn boundaries, and the
  speaking rate varies ±5% by content.
- **Review checks groundedness, not accuracy.** It can tell you a claim is absent from the excerpts.
  It cannot tell you the excerpts are right, and it will not catch a claim that is wrong in the same
  way the source is wrong.
- **English only, local speech only.** `tts.provider` accepts `local` and the language must be one
  the local profile covers, because a provider handed text it cannot pronounce usually returns
  confident audio rather than an error.
- **Apple silicon only**, inherited from mlx-audio.

## Troubleshooting

| Symptom                                              | Cause and fix                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `the model hit its output cap of N tokens`           | The dialogue ran away. Raise `llm.maxOutputTokens` or shorten `--duration`          |
| `exited 0 but wrote no output file`                  | The runner's `args` do not put audio at `{out}`                                     |
| espeak hard-exits on a `/Users/runner/work/...` path | The dylib workaround above was not applied, or the venv was rebuilt                 |
| `podcast.config.json is not valid`                   | The error names the field; the full expected shape is printed under it              |
| Episode much shorter than requested                  | `charsPerSecond` is too low for your voice. Re-measure from a run's `manifest.json` |
