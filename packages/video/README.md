# @handbook/video

Remotion project that renders the Learn module videos from the handbook's own pages and diagrams.
The plan and its status live in
[`docs/superpowers/plans/2026-10-20-module-videos-remotion.md`](../../docs/superpowers/plans/2026-10-20-module-videos-remotion.md).

```bash
pnpm --filter @handbook/video layout   # .mmd diagrams -> src/generated/*.layout.json (ELK)
pnpm --filter @handbook/video studio   # preview in Remotion Studio
pnpm --filter @handbook/video still src/index.ts Mcp out/frame.png --frame=640
pnpm --filter @handbook/video render src/index.ts Mcp out/mcp.mp4
```

In a cloud container without a regular Chrome, add
`--browser-executable=<playwright headless_shell> --chrome-mode=headless-shell`.

Scripts live in `src/videos/<slug>.ts`. Scene lengths come from the narration text until a scene
has `audioSeconds`, so the script is the one artifact to edit. Re-run `layout` after changing a
diagram. Rendered video is not committed.
