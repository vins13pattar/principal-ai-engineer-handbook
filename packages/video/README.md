# @handbook/video

Design: [`DESIGN.md`](DESIGN.md) (the Atlas world). Product context: [`PRODUCT.md`](PRODUCT.md).

Remotion project that renders the Learn module videos from the handbook's own pages and diagrams.
The plan and its status live in
[`docs/superpowers/plans/2026-10-20-module-videos-remotion.md`](../../docs/superpowers/plans/2026-10-20-module-videos-remotion.md).

```bash
pnpm --filter @handbook/video layout   # .mmd diagrams -> src/generated/*.layout.json (ELK)
pnpm --filter @handbook/video studio   # preview in Remotion Studio
pnpm --filter @handbook/video still Mcp out/frame.png --frame=640
pnpm --filter @handbook/video render Mcp out/mcp.mp4
```

In a cloud container without a regular Chrome, add
`--browser-executable=<playwright headless_shell> --chrome-mode=headless-shell`.

Scripts live in `src/videos/<slug>.ts`. Scene lengths come from the narration text until a scene
has `audioSeconds`, so the script is the one artifact to edit. Re-run `layout` after changing a
diagram. Rendered video is not committed.

## Narration

Narration runs on the machine that has the synthesis runner (Kokoro on Apple silicon, set up as
in [`docs/PODCAST.md`](../../docs/PODCAST.md)) and reuses the root `podcast.config.json`.

```bash
pnpm --filter @handbook/video narrate 06-mcp --dry-run          # size and estimate, no setup needed
pnpm --filter @handbook/video narrate 06-mcp --voice am_michael  # speak every scene
pnpm --filter @handbook/video narrate 06-mcp --scene roles       # one scene
pnpm --filter @handbook/video render McpNarrated out/mcp.mp4
```

Audio lands in `public/narration/<slug>/` (not committed). Each scene's measured length is written
to `src/videos/<slug>.audio.json` (committed), and the `McpNarrated` composition sizes every scene
from it. Unchanged scenes are skipped on a re-run, and a scene whose text changed after it was
spoken fails the render rather than playing stale audio. `Mcp` stays the silent, estimated cut.
Pronunciation fixes for the speech model live in `src/videos/speech.ts`.

## Timing, captions, and YouTube

```bash
pnpm --filter @handbook/video transcribe 06-mcp   # word times via whisper.cpp; also lists cues it could not find
pnpm --filter @handbook/video captions 06-mcp     # out/06-mcp.srt, in the page's wording
pnpm --filter @handbook/video youtube 06-mcp      # out/06-mcp.youtube.md: title, description, chapters, tags
```

`transcribe` builds whisper.cpp once into `.whisper/` (needs a C++ toolchain and ffmpeg) and writes
`src/videos/<slug>.timing.json`. In a script, give a reveal a `cue` phrase taken from the narration
and it lands on that word. Avoid words the speech lexicon rewrites (HTTP, MCP, stdio) in a cue.
Run `youtube` after `narrate` so chapter times use the real lengths.

## Make everything

All 16 modules have scripts (about 6 minutes each by estimate). On the Mac with Kokoro and ffmpeg set up:

```bash
pnpm --filter @handbook/video make                       # every video, in order
pnpm --filter @handbook/video make 08-rag 09-model-serving   # chosen ones
pnpm --filter @handbook/video make --skip-render         # audio, timings, captions, YouTube text only
```

For each video it runs `narrate` (voice `am_michael`, change with `--voice`), `transcribe`,
`captions`, `youtube`, then the narrated render to `out/`. A failure stops that video, continues
with the next, and is listed at the end. Re-running is safe: unchanged scenes are skipped. A cue
reported by `transcribe` as not found keeps its estimated time; reword the cue in the script.
Listen to each video before uploading, since the narration is AI-generated and must be disclosed.
