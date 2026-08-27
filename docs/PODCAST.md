# Podcast engine

Turns one handbook page into a two-voice podcast episode, so a reader can hear the page instead of
reading it. The model plans the arc and writes the dialogue; a local text-to-speech model speaks it;
the pipeline joins the segments into one file.

An episode covers the whole page by default, aiming at the page's own reading time — 18 minutes for
module 6, which is 3,918 words. Across all 63 documents the handbook is **414 minutes of prose**,
which projected to about seven hours of audio.

The finished series is **ten hours** — 63 episodes, 3:00 to 22:24, mean 9:30, summed from the
`audioSeconds` field of the manifests in `episodes/`. The projection was low because two voices
discussing a passage take longer than the passage takes to read, and the estimate treated reading
time as speaking time. Budget against the measured number, not the projected one.

Speech is local and therefore free. The only money this spends is on the language model — about
**$1.04 for an 18-minute episode** at Claude Sonnet pricing, or a third of that with
`--skip-review`. Input dominates the short episodes and output dominates the long ones.

Six stages: plan, dialogue, review, revision, synthesis, assembly.

## Layout

```text
packages/handbook-content/     Loads pages, builds the SourcePack an episode is sourced from
packages/podcast-providers/    LlmPort and TtsPort, the adapters behind them, WAV assembly
packages/podcast-engine/       Planner, dialogue, review, synthesis, manifests, the CLI
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

Both take a document id, and both print an estimate and exit without spending unless you pass
`--run`. Duration is optional: without it an episode aims at the page's own reading time, measured
from its prose at 220 words per minute.

Do not reach for the `estimatedMinutes` in a module's frontmatter — that is study time, including
code and exercises. Module 6 declares 50 minutes and is 17.8 minutes of reading. Most collections
declare nothing at all, and measuring the prose works for every page.

The two estimates mean different things. `plan` quotes a ceiling, which for a single call is a real
bound. `create` quotes an **expectation**, because summing eleven generous per-call caps produces a
number nothing approaches — quoting that as a ceiling made the estimate 2.2× the real cost, and a
figure always wrong by half is a figure you learn to ignore. The expectation is fitted to measured
runs and predicts within about 7%.

```bash
# What a plan call would cost, and whether the page supports an episode at all.
node --experimental-strip-types packages/podcast-engine/src/cli.ts plan module:06-mcp

# The whole pipeline: plan, dialogue, review, revision, synthesis, assembly.
node --env-file=... --experimental-strip-types packages/podcast-engine/src/cli.ts create module:06-mcp --run

# A shorter episode than the page, when you want a summary rather than a substitute.
node --env-file=... --experimental-strip-types packages/podcast-engine/src/cli.ts create module:06-mcp --duration 300 --run
```

| Flag            | Default                 | Meaning                                                    |
| --------------- | ----------------------- | ---------------------------------------------------------- |
| `--duration`    | the page's reading time | Seconds of speech to aim for                               |
| `--run`         | off                     | Actually call the model. Without it, nothing is written    |
| `--config`      | `podcast.config.json`   | Configuration path                                         |
| `--out`         | `.podcast`              | Where run directories are created                          |
| `--skip-review` | off                     | Skip the groundedness check. Halves the cost and the calls |

`plan` exists separately because it is the cheap half — one model call, no synthesis — and the half
worth running when the question is whether the source material supports an episode.

## What a run writes

Each run gets its own directory, `.podcast/<document>/<timestamp>-<suffix>/`, reserved atomically so
two runs can never share one:

| File            | Contents                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| `plan.json`     | The arc: beats, citations, per-beat seconds, what the model could not source    |
| `script.json`   | Every turn of the conversation, all of which is spoken                          |
| `transcript.md` | The conversation as readable text, for a person or another voice provider       |
| `episode.wav`   | The episode                                                                     |
| `manifest.json` | Status, model, usage, measured cost, turn and character counts, review findings |
| `failure.json`  | Only on failure: the model's raw text and finish reason                         |

`transcript.md` is the portable artifact: `**Host:**` and `**Guest:**` start a line and appear
nowhere else, so `grep '^\*\*Guest:\*\*' transcript.md` is the guest's script — ready to hand to
ElevenLabs, Sarvam, or a human reader. Its header records the source page, the model, the voices and
the runtime, because a transcript outlives the run directory it was written in. It is written
**before** synthesis and rewritten after: the words cost money and the audio does not, so a run that
dies rendering still leaves something another provider can speak.

`script.json` holds the conversation **after revision**, and every turn in it is spoken — the audio
and the script are the same thing. Revision is the only edit the pipeline makes to its own output,
and the manifest names every finding behind it.

A failed run still writes a manifest with everything spent up to the failure. A run that dies in
synthesis has already paid for its model calls, and a manifest reporting zero for them would
understate the bill.

## Listening to an episode, and publishing it

The pipeline writes `episode.wav`, which is what assembly needs and not what a
reader should download — 13 MB for five minutes. Play it straight from the run
directory first:

```bash
afplay .podcast/module-06-mcp/<run>/episode.wav
```

When it is worth publishing, one script encodes it and tells you what to write:

```bash
scripts/publish-episode.sh .podcast/module-06-mcp/<run>/episode.wav module-06-mcp
```

That writes `apps/handbook/public/podcast/<slug>.m4a` at 32 kbps mono AAC —
about a megabyte for five minutes, indistinguishable through the speakers
anyone will use — and prints the `<EpisodePlayer>` line with the measured duration
already filled in. Take the duration from the script rather than typing it: a
player labelled with a length it does not have is a small lie the reader catches
in the first ten seconds.

To put the transcript on the page too, copy it into `apps/handbook/src/transcripts/` — **not**
under `src/content/docs/`, where Astro validates every `.md` against the docs collection schema and
the build fails — then strip its header and demote `##` to `###` so the page keeps one H1 and its
own outline:

```mdx
import { Content as Transcript } from "../../../../transcripts/module-06-mcp.md";

<EpisodePlayer
  file="module-06-mcp.m4a"
  duration="22:27"
  model="Claude Sonnet 5"
  generated="2026-08-22"
>
  <Transcript slot="transcript" />
</EpisodePlayer>
```

It renders collapsed. An imported component's headings do not reach Starlight's table of contents —
verified, the page keeps its own 32 entries — so a twelve-beat transcript does not flood the
sidebar.

Then see it in the page:

```bash
pnpm dev   # http://localhost:4321/learn/modules/06-mcp/
```

Check it in **both** colour schemes. The first version of the player looked
correct in light mode and put light grey text on a near-white card in dark,
because it asked for a `--sl-color-gray-7` that Starlight does not define and
silently got a hardcoded fallback. `pnpm build` was green throughout.

### Where episodes are served from

Episodes live in the **`handbook-podcast`** R2 bucket, served publicly from
`https://podcast.vinodspattar.in`. They are not in git and should not be: 63
documents at 1.1 MB is 69 MB of binaries every clone would pay for forever, for
bytes the CDN already serves.

A page names its episode file and never names a host. `EpisodePlayer` resolves
the URL against `PUBLIC_PODCAST_BASE_URL`, **defaulting to production** — so
someone editing prose gets a working page without holding a bucket, a
credential, or an environment variable. To preview an episode you generated
locally into `public/podcast/`, point the base at it:

```bash
PUBLIC_PODCAST_BASE_URL=/podcast pnpm dev
```

```bash
npx wrangler r2 bucket create handbook-podcast

npx wrangler r2 object put handbook-podcast/module-06-mcp.m4a \
  --file apps/handbook/public/podcast/module-06-mcp.m4a \
  --content-type audio/mp4 --cache-control 'public, max-age=3600' --remote
```

An hour, not a year: regenerating an episode reuses the same filename, so an
immutable cache would pin a corrected episode out of reach for as long as it
survived at the edge.

Do not trust `wrangler r2 bucket info` to confirm an upload — its `object_count`
is periodic and read `0` immediately after a verified upload. Round-trip the
object instead, which proves both that it arrived and that it arrived intact:

```bash
npx wrangler r2 object get handbook-podcast/module-06-mcp.m4a --remote --file /tmp/check.m4a
shasum -a 256 apps/handbook/public/podcast/module-06-mcp.m4a /tmp/check.m4a
```

A new bucket is private, so the object is uploaded but unreachable until a
custom domain is attached. That needs the zone id, from the Cloudflare
dashboard's overview page for the domain:

```bash
npx wrangler r2 bucket domain add handbook-podcast \
  --domain podcast.<your-domain> --zone-id <ZONE_ID> --min-tls 1.2
```

Because the component defaults to that domain, no Workers Builds environment
variable is needed — the deploy has nothing to configure. The r2.dev URL
(`wrangler r2 bucket dev-url enable`) is the quick alternative, but Cloudflare
rate-limits it and says not to use it in production.

Confirm a newly attached domain actually serves before relying on it, and check
more than the status code — without `accept-ranges` the player cannot seek:

```bash
curl -sSI https://podcast.<your-domain>/module-06-mcp.m4a | grep -E 'HTTP|content-type|accept-ranges'
```

Deliberately **not** an R2 binding on the Worker. This site deploys as a Worker
with no `main` — static assets only, per
[ADR-0007](https://github.com/vins13pattar/principal-ai-engineer-handbook/blob/main/apps/handbook/src/content/docs/adr/decisions/0007-workers-static-assets-deployment.mdx).
Serving R2 through it would mean adding a script and a binding, reversing that
decision to save nothing: a public bucket on its own domain serves the same
bytes from the same edge.

`apps/handbook/public/podcast/` is gitignored. Anything you put there is for
your own preview only and will not ship; the bucket is what ships.

## Running it for free, on a local model

Speech has always been local. The language model is the only thing that costs
anything, and it does not have to.

LM Studio, vLLM and llama.cpp all serve the vendor APIs, so a local model needs
no new adapter — point the provider you already have at localhost:

```json
"llm": {
  "provider": "openai",
  "baseUrl": "http://127.0.0.1:1234/v1",
  "modelId": "<the id the server reports>",
  "maxOutputTokens": 16000
}
```

LM Studio serves an Anthropic-compatible endpoint too, so `"provider":
"anthropic"` against the same base URL works; pick whichever the model behaves
better under. If the server requires a token, put it in `PODCAST_LLM_API_KEY`
like any other — it never leaves the machine. `"provider": "ollama"` is also
built in, talking to Ollama's own API at `http://localhost:11434`.

Structured output is what makes this viable rather than a science project. Every
stage of the pipeline demands schema-valid JSON, and these servers constrain
decoding to a JSON Schema — so the model _cannot_ emit a shape the schema
rejects, which is the same guarantee the hosted path has. A local model that
merely tries to write JSON would fail at the first beat.

Set `prices` to zero when you do this, or the manifest will bill you for
electricity at Anthropic's rates.

What it costs instead is time and memory: minutes per beat rather than seconds,
and a model large enough to write decent dialogue competing with Kokoro for the
same RAM. Whether the conversation is worth listening to is the open question,
and the cheapest way to answer it is to generate one page both ways and compare.

## The measured numbers

Three configuration values are measurements, not preferences. Re-measure them on different hardware
or a different voice.

**`tts.charsPerSecond: 14.77`** — the speaking rate, and the number that decides whether "five
minutes" means five minutes. Pooled over eight real episodes and 34,978 characters across two
documents, with per-episode rates from 13.96 to 15.89. Measure it on dialogue rather than prose: an
early benchmark read one paragraph straight through and got 16.2, and using that figure made a
300-second request produce 513 seconds of audio.

The spread is content, not noise — a protocol-heavy page speaks slower than a narrative one, which
has fewer identifiers to enunciate — and it is now the whole residual error. Trimming lands within a
few characters of budget, so an episode comes out short precisely when its content speaks faster
than this number says. Both documents tried so far land about 9% under. Re-measure from a run's
manifest (`charactersRendered` over the audio's duration) if a kind of page is consistently off.

**`tts.synthesisCost: { fixedSeconds: 3.16, marginalRtf: 0.073 }`** — render time is
`fixed + marginal × audioSeconds`, **per call**. The fixed term is model load, and it is paid per
segment rather than per episode, which is why segment count is a planning decision and not a tuning
detail. A five-minute episode renders in about a minute on an M4.

**`llm.maxOutputTokens: 16000`** — a ceiling, and ceilings only cost when hit. Two early runs died on
truncation at 4000 and 8000, each wasting a full pair of calls.

## Why length is guidance, not a rule

The model will not hit a length target by instruction. Asked three different
ways — a character budget, that budget with an explicit ten-percent tolerance,
and a turn count — it overran by 48%, 57% and 96%. The overrun got _worse_ as
the instruction got more precise, because a model cannot count the characters it
is emitting.

There was a trim here that solved that by cutting the script back to budget. It
is gone, and the reason is worth keeping. Cutting per beat takes the last turns
of the last beat, which is the close — so one episode ended on the host asking
"so where's the cost hiding?" with the guest's answer amputated. The duration was
correct to within nine percent and the episode was broken.

Length is shaped where it can be shaped well: each beat asks for a number of
turns, derived from its seconds. Whatever comes back is spoken in full. An
episode runs as long as the conversation runs, and a five-minute request that
produces nine minutes of coherent dialogue is a better outcome than five minutes
that stop mid-exchange.

Dialogue is generated one call per beat for a separate reason. A single
whole-episode call could not be bounded, and it was more expensive: a beat needs
the excerpts it cites, not the whole 24,500-token pack, so five small calls send
less than one large one.

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

Every failure inside this stage degrades to the unrevised beat rather than to a dead run, because a
review is an improvement on a beat that already exists and is already paid for. The review call
throwing, the revision call throwing, a revision coming back with a different number of turns, a
finding naming a turn the beat does not have — none of them end the run, and each records what
happened rather than passing as success:

| Manifest field     | Means                                                             | Run prints                  |
| ------------------ | ----------------------------------------------------------------- | --------------------------- |
| `beatsReviewed`    | Checks that succeeded. With `beatsNotChecked`, what was attempted | `clean` or the findings     |
| `beatsRevised`     | Findings were fixed                                               | `… — revised`               |
| `beatsLeftUnfixed` | Findings exist and the fix did not land                           | `… — NOT fixed (why)`       |
| `beatsNotChecked`  | The review call failed; this beat went unchecked                  | `NOT CHECKED (why)`         |
| `droppedFindings`  | Findings naming a turn the beat does not have                     | `discarded as out of range` |

`beatsReviewed` counts successful checks, not beats — a beat nobody managed to check is not a beat
that passed, and `droppedFindings` above zero on a beat with no findings means the same thing.
Watch that one: if a reviewer's turn numbering is systematically off, every beat would otherwise
report clean while nothing was actually checked.

Across two documents review has found twelve problems with no false positives, and it roughly
doubles the cost: **$0.46 against $0.21**. What it finds depends heavily on the page. The
protocol-heavy module produced four `unspeakable` findings and two `unsupported`; the narrative
interview page produced zero `unspeakable`, five `unsupported`, and the first `repeats`.

The `unsupported` findings share a shape worth knowing: **invented specificity**. A number ("the
other nine you've got open"), an example ("build-versus-buy", where the sources discuss three other
trade-offs), an enumeration ("all four levels"), a callback to something never said. Each one sounds
exactly like the kind of detail the source would contain, which is what makes them hard to catch by
reading and worth a stage of their own. `--skip-review` turns it off; the manifest records
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
