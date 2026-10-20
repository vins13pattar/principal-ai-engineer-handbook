# Module videos with Remotion — plan

> **Status:** planned, not started. Nothing below exists in the repo yet. This is a plan at the level
> of format, architecture, and phases; each phase gets its own task-level plan when it starts.

**Goal:** One short, narrated, diagram-driven video for each of the sixteen Learn modules, rendered
at the highest quality we can sustain, produced as code so it can be re-rendered when a module
changes.

## Why this shape

The format comes from the research summarised in the conversation that produced this plan. In
short: keep each video to about 5–8 minutes (chapters of up to 12 for the long modules), build it
around animated diagrams that appear step by step, show the lab as a short screencast, and use a
presenter face at most as a small inset. The handbook is architecture-heavy, so the diagrams carry
the content. The evidence did not test developers or architecture content directly; the format
matching is an inference, and the pilot below is how we check it.

## Decisions already made

| Decision       | Choice                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video engine   | [Remotion](https://www.remotion.dev/docs) — React components rendered to video                                                                                          |
| License        | Remotion's Free License: individuals and companies of up to 3 people, all features, unlimited commercial use. **Terms apply, and we must upgrade if the organization grows.** |
| Source of truth | The handbook pages and their `.mmd` diagrams. Videos are derived, never hand-edited.                                                                                    |
| Format         | 5–8 minute explainer per module, animated diagrams, voice-over, burned-in or sidecar captions                                                                            |

## Open decisions

| Decision          | Options                                                                    | Recommendation                                                                                                              |
| ----------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Narration voice   | Local Kokoro (free, already wired), or a premium TTS or a human recording  | Pilot with Kokoro, then A/B one module against a premium voice. "Highest quality" is limited more by the voice than the picture. |
| Master resolution | 1080p, or 4K                                                               | Compose at 1920×1080 and render at `--scale=2` for a 3840×2160 master. Publish 1080p and 4K from the same composition.       |
| Hosting           | Cloudflare Stream or R2, or YouTube embeds                                 | R2 with an HLS ladder if we want no third-party player. YouTube if reach matters more than control.                          |
| Pilot module      | Any                                                                        | Module 6 (MCP): two diagrams, an existing episode to compare against, and a measured 17.8 minutes of prose to condense.      |

## Quality bar

"Highest quality visuals" is made testable, so the pilot can pass or fail it.

- **Resolution and frame rate.** 3840×2160 master at 30 fps. Try 60 fps in the pilot and keep it only
  if the diagram motion visibly improves; it doubles render time.
- **Encoding.** H.264 at a low CRF for the master (about 16–18), 10-bit if the player target allows.
  Smaller renditions are derived from the master with FFmpeg, not re-rendered.
- **Type.** Body text is never smaller than 36 px on the 1080p composition. Code uses the site's
  monospace font at a size readable on a phone.
- **Motion.** One motion language for all sixteen: spring-based easing from a shared preset file, a
  fixed stagger between elements, no element appears without a reason in the narration.
- **Sync.** Every reveal is cued to a word in the narration using word-level timestamps, not to a
  hand-set frame number.
- **Colour.** Tokens taken from `apps/handbook/src/styles/global.css` (`--color-brand-*`), a dark
  theme as the default, and every colour pair checked for contrast. Meaning never depends on colour
  alone.
- **Density.** At most one new idea and about five new elements per beat. Previously shown elements
  dim instead of disappearing, so the viewer keeps the whole picture.
- **Camera.** Large diagrams are explored with slow pans and zooms to the active region, not shrunk
  until the labels are unreadable.
- **Accessibility.** Captions in every video, a linked transcript on the module page, chapter
  markers, no flashing, and respect for the viewer's captions preference in the player.

## Architecture

### Repository layout

```text
packages/video/                 Remotion project: compositions, scenes, motion presets, theme
packages/video-pipeline/        Script generation, narration, timestamps, manifests, render CLI
videos/<module-slug>.json       Committed manifest per video, like episodes/*.json
videos/<module-slug>.script.md  Reviewed narration script (the editable artifact)
```

Rendered files are **not** committed. They go to object storage, and the manifest records the URL,
duration, resolution, and the content hash they were rendered from.

The pipeline follows the podcast engine's pattern: it imports ports, not vendors, so it can be
tested without a network or API key. Reuse `LlmPort` and `TtsPort` from
`packages/podcast-providers` where the shapes fit, and extend them rather than forking. All
`remotion` and `@remotion/*` packages are pinned to one exact version, which Remotion requires.

### Pipeline

```text
module .mdx + .mmd
      │
      ▼
1. Outline      Pick the module's one decision, five to seven beats, the diagram to show per beat
      ▼
2. Script       Scene-by-scene JSON: narration text, visual directive, diagram step, cue words
      ▼
3. Review       Model review against the page for factual drift; human edit of the .script.md
      ▼
4. Narration    TTS per scene → audio files; measure each scene's real duration
      ▼
5. Timestamps   Word-level timings (whisper.cpp via @remotion/install-whisper-cpp) for cues + captions
      ▼
6. Render       Remotion composition reads the manifest; scene lengths come from calculateMetadata
      ▼
7. QA           Still frames per beat, caption check, loudness check, human watch-through
      ▼
8. Publish      Upload, write URL and hash into the manifest, wire the embed into the module page
```

This reuses the podcast engine's plan → write → review → synthesise shape. The difference is that
the output is a single narrator and a visual directive per scene, aimed at 5–8 minutes rather than
the page's reading time. The podcast measured that a requested duration overruns by about a third,
so ask for a shorter target than needed and measure the audio.

Stage 4 and 6 run on Apple silicon: the repo's Kokoro setup needs it, and Remotion needs macOS 15 or
later there. Stages 1–3 run anywhere. If we later want CI rendering, Linux needs the dependencies
listed in Remotion's docs, and a premium cloud voice removes the Apple-silicon constraint.

### Diagrams: one source of truth

Each module already ships one or two Mermaid sources (`learn/modules/*.mmd`). The pilot's main
technical bet is to render them as animated scenes without redrawing by hand:

1. Parse the `.mmd` into nodes, edges, and groups.
2. Lay them out once with a layout engine (ELK or dagre), producing fixed positions.
3. A Remotion `<Diagram>` component draws the nodes and edges as SVG from those positions and
   reveals them in the order the script's diagram steps name.

A diagram edit then updates the video on the next render. If automatic layout is not good enough for
a diagram, the manifest can override positions for that diagram only. If the bet fails in the pilot,
the fallback is hand-built scenes for the modules that need them, which costs more per video.

### Scene library

A small set of reusable scenes, so sixteen videos look like one series:

| Scene            | Use                                                              |
| ---------------- | ---------------------------------------------------------------- |
| Cold open        | The problem in one sentence over a stripped-down visual          |
| Diagram build    | The main scene: step-by-step reveal, camera, highlighted path    |
| Failure replay   | A request or message animated along the diagram until it fails   |
| Trade-off        | Two options side by side with the deciding constraint called out |
| Code focus       | Syntax-highlighted excerpt with line-range emphasis              |
| Lab screencast   | A recorded terminal run, trimmed and captioned                   |
| Recap            | Three takeaways and the link to the lab and interview questions  |

Lab screencasts are recorded deterministically with a terminal-recording tool (VHS or asciinema)
from a script, so they can be regenerated, then embedded with Remotion's video components.

### Captions and audio

- Word-level captions from the same timestamps that drive the animation.
- Normalise narration loudness to a single target for the whole series.
- A light, low-volume music bed is optional; skip it in the pilot and decide after hearing the voice
  alone.

### Embedding

A `ModuleVideo` component in `packages/components` renders the player, chapters, a captions
toggle, and the transcript, driven by the manifest. The module page frontmatter links to the video
slug the same way pages already link to their podcast episode. The transcript is generated from the
script, so it stays in sync.

## Phases

**Phase 0 — Spike (about 2 days).** Scaffold `packages/video` with a blank Remotion project and the
Remotion agent skills. Render one hard-coded diagram scene at 4K. Measure render time per minute of
video. Decide 30 versus 60 fps with a side-by-side. Exit: a 20-second clip that meets the quality
bar and a render-time number.

**Phase 1 — Diagram engine.** Mermaid → layout → animated `<Diagram>`. Theme tokens, motion
presets, the scene library skeleton. Exit: module 6's two diagrams animate from their `.mmd` files
with no hand placement.

**Phase 2 — Pilot video (module 6).** Pipeline stages 1–7 for one module, human-edited script,
Kokoro narration, captions. A/B the voice against one premium option. Exit: a 6–8 minute video
reviewed against the quality bar and against the module's existing podcast episode. Collect the
decisions this surfaces on voice, resolution, and hosting.

**Phase 3 — Publish path.** Hosting, HLS or MP4 ladder, `ModuleVideo` embed, manifest, `check:videos`
script that fails when a module changed but its video hash did not. Exit: the pilot is live on the
module page.

**Phase 4 — Roll out.** Remaining fifteen modules, ordered by how diagram-heavy they are. Module 3
(networking), 8 (RAG), and 9 (model serving) are likely quickest; modules 0, 13, and 14 are
text-heavy and need the Trade-off and Cold-open scenes more than diagrams. Batch the LLM stages;
render in the background.

**Phase 5 — Maintenance.** A content change to a module marks its video stale in `check:videos`.
Re-render is one command. Re-measure watch time by chapter once there is data, and cut where
viewers leave.

## Risks

| Risk                                                                                  | Mitigation                                                                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Auto-laid-out diagrams look worse than hand-built ones                                | Per-diagram position overrides; fall back to hand-built scenes for the few that need them        |
| Narration quality limits the whole series                                             | A/B a premium voice in the pilot before committing sixteen videos to Kokoro                      |
| 4K at 30–60 fps renders are slow                                                      | Measure in Phase 0; render from a cache of per-scene clips; consider Remotion Lambda or cloud render if needed |
| Apple-silicon-only narration blocks CI                                                | Keep narration a local, cached step; the render only needs the committed audio hash             |
| Video drifts from the page after edits                                                | Content hash in the manifest and a `check:videos` gate                                           |
| Factual errors introduced by script generation                                        | Review stage against the page, then a human edit of every script before narration               |
| Remotion license terms change, or the organization grows past the Free License limit  | Re-read the license page before each major batch; the compositions are React and portable enough to reconsider |
| Large files in the repo                                                               | Rendered video is never committed; only manifests and scripts                                    |
| Synthetic narration                                                                   | Disclose the voice is synthetic on the video page, as the podcast episodes presumably do        |

## Cost

LLM spend for scripts is modelled on the podcast: roughly $0.40–$1.00 per video at Claude Sonnet
pricing, depending on the review stage. Local narration is free. Render time and hosting are the
unknowns, and Phase 0 and Phase 3 exist to put numbers on them before the roll-out.

## Out of scope

- Interview-track videos. Those stay text and podcast unless the pilot shows demand.
- A human presenter. A small inset can be added later without changing the pipeline.
- Real-time or interactive video. The player is a standard video player.
