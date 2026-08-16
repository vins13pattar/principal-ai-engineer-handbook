# @handbook/podcast-providers

Model and voice access for the podcast engine: two narrow ports, the Vercel AI SDK behind them, and
Cloudflare AI Gateway underneath that.

The orchestration decision is [ADR-0008](https://handbook.vinodspattar.in/adr/decisions/0008-typescript-podcast-pipeline/).
This package is the provider half of it.

## The layering, which is the part people get wrong

```text
podcast engine          knows only LlmPort and TtsPort
      |
  ports.ts              two interfaces, ~60 lines, no vendor types
      |
  ai-sdk.ts             the ONLY file importing `ai` or `@ai-sdk/*`
      |
  provider packages     @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/elevenlabs
      |
  Cloudflare AI Gateway a baseURL substitution — caching, retries, fallback, cost logs
      |
  the actual providers
```

**AI Gateway is not an alternative to the AI SDK or to LangChain.** It is a reverse proxy that sits
_underneath_ whichever SDK you chose: you point the SDK at a gateway base URL and the request still
speaks the provider's own wire format. That is the entire integration — see `baseUrlFor` in
`registry.ts`. Turning it off is deleting two environment variables.

## Why the AI SDK rather than LangChain JS, for this pipeline

**It covers speech and text through the same provider shape.** `@ai-sdk/openai` and
`@ai-sdk/elevenlabs` both expose `.speech()`, so changing voice vendor is configuration.
`@langchain/core` has no speech abstraction at all — its model interfaces are language models and
embeddings — so a LangChain pipeline needs a second, hand-written abstraction for the voice half
regardless. Given that the hand-written abstraction has to exist, it may as well be these ports, and
the layer underneath may as well cover both halves.

Checked rather than assumed: `@langchain/core` has no `speech`, `audio`, `tts`, or `voice`
entrypoint; `ai` v7 exports `generateSpeech` and `transcribe` as stable.

## Providers

Cloudflare AI Gateway proxies **26 providers**, three of which are voice — `elevenlabs`,
`deepgram`, `cartesia`. That list is not transcribed from documentation; it is asserted in
`gateway.test.ts` against `workers-ai-provider`'s own `GATEWAY_PROVIDERS` table, so it cannot drift.

Gateway provider ids are Cloudflare's, not the vendor's: Google AI Studio is `google-ai-studio` and
xAI is `grok`. Getting one wrong 404s at call time rather than failing as configuration, so
`gatewayBaseUrl` rejects unknown ids up front with the list in the message.

## The cost finding, which contradicted the obvious reading

```bash
node --experimental-strip-types packages/podcast-providers/src/cli.ts 3 15 100
```

```text
rounds |    LLM |  speech |   total | speech share
     0 |  $0.56 |   $3.80 |   $4.36 |          87%
     1 |  $0.82 |   $3.80 |   $4.62 |          82%
     8 |  $2.68 |   $3.80 |   $6.48 |          59%

Seven extra revision rounds outweigh the audio only below $49/M speech characters.
```

The revision loop is the only _unbounded_ term in the pipeline, so it looks like the one to control.
At premium voice pricing it is not: **audio is 87% of a clean episode, and seven extra rounds of
rework cost less than a single synthesis.** The primary cost control there is segment-level
regeneration, not the revision cap.

Below roughly $49 per million characters this reverses and the revision cap matters more.
`revisionBreakEvenSpeechPrice` computes the crossover for your own prices, because the conclusion is
sensitive to a number that changes.

A test asserting eight rounds cost more than double one round is what found this — it failed at 6.48
against 9.24, and the failure was right.

## Two things the ports pin

**Speech is billed per character, not per token.** `Usage` carries `speechCharacters` separately so
a cost model cannot silently treat audio as text.

**`appliedSpeed` distinguishes "applied 1.0" from "ignored your 1.3".** A voice director that thinks
it is varying pace, against a provider that ignores the control, produces a flat episode with no
error anywhere.

## Testing without a network

`fakes.ts` exports `FakeLlm`, `BrokenLlm`, and `FakeTts` from the package rather than hiding them in
a test directory — every downstream stage needs them, and a fake confined to one package's tests
gets copied and then diverges.

`FakeLlm` validates each queued response against the caller's Zod schema. A fake that returns
whatever the test hands it proves the pipeline works on data the real schema would reject.

## Verify it

```bash
pnpm --filter @handbook/podcast-providers test
pnpm --filter @handbook/podcast-providers check
```

59 tests, no network access. Both run as part of `pnpm verify`.

## Multilingual

English first, then Indian and international languages. Three things are decided in
`language.ts` rather than left to the TTS call:

**`language` is required on `SpeechRequest`, not optional.** An optional language defaults to
English somewhere in an adapter, and a provider handed text it cannot pronounce usually returns
confident audio rather than an error — a shippable-looking artifact in the wrong language that
nothing downstream can detect. `assertSpeakable` refuses at the boundary instead.

**`en-IN` is a distinct tag from `en-US`.** Indian English is a voice target, not a fallback.

**Localisation strategy is recorded per episode**, because the choice reaches back into generation:

| Strategy     | What it does                                   | Cost                                                                                    |
| ------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `translated` | Generate in English, translate the script      | One generation. Sounds translated — English discourse structure with other words on top |
| `native`     | Run the dialogue agents in the target language | A full generation per language, plus a reviewer who reads it                            |

The reviewer is the part usually forgotten. A groundedness check on Tamil dialogue needs a grader
that reads Tamil; without one the gate is decorative for every language but English.

### Sarvam

Covers 17 Indian languages with `bulbul:v2`/`bulbul:v3`. Language tags come from Sarvam's own
published SDK, not from marketing copy.

**The community Vercel AI SDK provider does not cover TTS.** `sarvam-ai-provider` on npm exposes
only `transcription`/`transcriptionModel` — speech _to_ text. Verified by introspecting the
installed package. So `sarvam.ts` calls the REST API directly and presents it as a `TtsPort`, which
is the port design earning its keep: the engine cannot tell that one voice arrives by a different
mechanism.

Neither gateway proxies Sarvam, so that traffic goes direct and is outside gateway cost reporting.
`UsageLedger` closes the gap because it counts characters regardless of route.

## Local TTS

`createLocalTts` runs any local model as a subprocess behind the same port. It is deliberately a
command template rather than a binding to one model — the local TTS field moves fast enough that a
hardcoded runner would date this file within months.

This is the largest cost lever in the whole pipeline. Speech is 87% of a clean episode at premium
voice pricing, so local synthesis does not shave the bill, it removes the majority of it.

**Nobody can tell you the real-time factor for your machine, including this README.** It depends on
the chip, the memory, the runner, the quantisation, and what else is open. So measure it:

```bash
node --experimental-strip-types packages/podcast-providers/src/bench.ts \
  --name kokoro-82m --command .venv/bin/python \
  --args "-u,runners/kokoro_mlx.py,--text,{text},--out,{out},--voice,{voice},--speed,{speed},--lang,{language}" \
  --voice af_heart --save /tmp/sample.wav
```

`runners/kokoro_mlx.py` exists because `mlx_audio.tts.generate` writes `{file_prefix}_000.wav`,
never the path handed to it, and the port reads exactly `{out}`. Its docstring has the setup,
including a non-obvious one: **the `espeakng-loader` wheel is broken on Apple silicon** — every
version from 0.2.0 to 0.2.4 ships a dylib that ignores the data path passed to `espeak_Initialize`
and hard-exits on the path baked in at its build. `brew install espeak-ng` and symlink the loader at
it.

The bench sweeps four call sizes instead of repeating one, and reads each duration off the WAV
rather than estimating it. Both were wrong here, in the same direction:

| Was                                | Is                                                   |
| ---------------------------------- | ---------------------------------------------------- |
| Duration estimated at 14 chars/sec | Read from the WAV — `af_heart` speaks 16.2 chars/sec |
| One call size, cold/warm mean      | Four sizes, least-squares fit of two terms           |
| `RTF x episodeMinutes`             | `segments x fixed + marginal x audioSeconds`         |

Estimating the duration reported every RTF ~15% better than it was. Scaling a single RTF to an
episode was worse than imprecise — it was the wrong model, and it is why the number below is a
formula rather than a factor.

### What it measured here

M4 (24 GB), Kokoro-82M bf16 via mlx-audio, voice `af_heart`, 24 kHz mono:

```text
   chars     audio    compute    RTF
     730     45.1s      6.47s   0.143
    1461     88.9s      9.88s   0.111
    2923    176.5s     15.65s   0.089
    4385    263.0s     22.62s   0.086

compute = 3.16s per call + 0.073 x seconds of audio
```

The per-call RTF falls by 40% across that sweep. Nothing about the model changed; a fixed ~3.2s of
model load is being spread over more audio. Once loaded it synthesises 13.7x faster than real time,
and **every call pays the 3.2s again**, because `createLocalTts` spawns a process per
`synthesise`.

That turns segmentation into a cost decision rather than a structural one:

| Segments | 40-min render | Of which model load |
| -------- | ------------- | ------------------- |
| 1        | 3.0 min       | 2%                  |
| 20       | 4.0 min       | 26%                 |
| 60       | 6.1 min       | 52%                 |
| 120      | 9.3 min       | 68%                 |

Same audio, same model, three times the compute. Segment-level regeneration is the primary cost
control once speech is 87% of the bill — and past a few dozen segments most of what it costs is
loading Kokoro, not speaking. The fix when that bites is a persistent runner behind the port, not a
faster model; the port shape does not change either way.

The bench saves the audio too, because RTF says nothing about whether the voice is listenable.

Four guarantees the adapter tests pin against a real subprocess, not a mock:

- text never reaches a shell, so episode text containing `;` or backticks cannot become a command;
- a runner that exits 0 without writing is a named error, not an `ENOENT` with a temp path (that
  was a real defect, found by running it);
- a missing binary reports as a start failure;
- local usage records characters but zero price, so local and hosted runs stay comparable.

## Not done yet

- **Only OpenAI, Anthropic, ElevenLabs, and Sarvam are wired.** The Cloudflare gateway list has 26;
  adding one is a case in `registry.ts` plus its SDK package.
- **One model has been measured, on one machine.** Kokoro-82M on an M4 is viable with room to
  spare; that is evidence about this laptop, not a recommendation for yours. Run the bench.
- **The 3.2s per-call cost is measured but not addressed.** A persistent runner behind the port
  would remove it. Nothing needs it yet, and the number should decide when.
- **`SPEECH_LANGUAGE_COVERAGE` for `local` claims English only.** Widen it after listening, not
  after reading a model card.
- **Workers AI is not wired as a provider yet**, though `workers-ai-provider` is a dependency for
  its gateway table. Running inference on Cloudflare's own models is a separate decision from
  proxying other vendors through the gateway.
- **No retry or timeout in the ports.** Deliberate while a gateway is in the picture — it retries
  without the application knowing. `withFallback` exists for running without one.
- **Prices are configuration with no defaults.** Provider pricing changes faster than this file
  would, and a stale constant produces confident wrong numbers.
