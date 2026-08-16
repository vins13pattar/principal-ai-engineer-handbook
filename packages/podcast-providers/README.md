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

24 tests, no network access. Both run as part of `pnpm verify`.

## Not done yet

- **Only OpenAI, Anthropic, and ElevenLabs are wired.** The gateway list has 26; adding one is a
  case in `registry.ts` plus its SDK package.
- **Workers AI is not wired as a provider yet**, though `workers-ai-provider` is a dependency for
  its gateway table. Running inference on Cloudflare's own models is a separate decision from
  proxying other vendors through the gateway.
- **No retry or timeout in the ports.** Deliberate while a gateway is in the picture — it retries
  without the application knowing. `withFallback` exists for running without one.
- **Prices are configuration with no defaults.** Provider pricing changes faster than this file
  would, and a stale constant produces confident wrong numbers.
