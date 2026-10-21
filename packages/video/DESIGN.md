# Design: Atlas of Engineering plates

The video world for the Principal AI Engineer Handbook series. Recorded from the built world in
`src/theme.ts`, `src/scenes/Chart.tsx`, and the scenes beside it. Product truth is in `PRODUCT.md`.

## Idea

Each module is one chart plate in an atlas. The system is a territory the viewer is walked across;
narration lights places and routes one by one. The chart is never empty: every scene opens with its
full map drawn in ghost, so there is always something to read while the narration begins.

## Ground and colour

A nautical night chart: someone studying at a laptop in the evening, so dark.

| Role              | Token                       | Value                                                      |
| ----------------- | --------------------------- | ---------------------------------------------------------- |
| Sea (ground)      | `sea` / `seaLift`           | `#0b0a2c` / `#181449`, radial from the top right           |
| Land (place fill) | `place`                     | `#1b1763`                                                  |
| Chart ink         | `ink`, `inkSoft`, `inkMute` | `#f3f4ff`, `#c9cdf2`, `#9aa0d6`                            |
| Linework          | `brand300` to `brand800`    | the handbook indigo ramp from `packages/ui/src/tokens.css` |
| Active route      | `route`                     | `#ffb454`, the only warm colour on a plate                 |
| Failure, hazard   | `fault`                     | `#ff6b81`, always paired with a mark or label              |
| Success           | `ok`                        | `#4cd4a0`, always paired with a check or label             |

Colour carries one job at a time: amber is "the thing being explained now", coral is "this is where
it breaks". Nothing relies on colour alone: failures also carry a cross or a numbered triangle.

## Type

- **Spectral** 700 and 800 for plate titles and statements; 600 italic for region and place-names
  (the italic reads as chart lettering). Bundled via `@fontsource/spectral`.
- **Source Sans 3** (variable) for labels and running text, 450 to 650.
- **JetBrains Mono** only for code, the `_meta` tag, and the plate number.

Sizes at 1080p: headline 58 to 68, statements 62 to 84, labels 30 to 34, edge labels 24, the key 24 to 29.

## Frame (owned by the world)

`Chart.tsx` draws the same frame on every plate:

- A double neatline with graticule ticks, and authored topographic contours that drift slowly (the
  only ambient motion).
- The cartouche: the headline in Spectral with a short amber rule under it. No eyebrow or kicker.
- The plate number, top right, in mono (`PLATE 06 · MCP`).
- The route line along the bottom: a pin per scene, lit to the current position. It is the video's
  progress and its table of contents.

The calm centre (the diagram or statement) stays inside this frame and never competes with it.

## Symbols

- **Place**: a labelled chip with a pin on its left edge. Faint outline and dim label until lit.
- **Region**: soft indigo land with an italic title.
- **Route**: a line between places; amber and pulsing when active; arrowheads for direction.
- **Blocked route**: coral dashes ending in a cross.
- **Hazard**: a numbered coral triangle, explained in a key below the map.
- **Key**: each diagram plate names the symbols it uses, bottom left, from the first frame.

## Motion

- One spring family (`src/motion.ts`): arrivals settle with almost no overshoot; the camera is
  critically damped.
- Reveals are cued to spoken words, a quarter second early.
- The camera shows the whole chart for the first 1.6 seconds, then dives to what is being explained.
  Shown-but-not-focused elements dim instead of disappearing.
- Scene changes cross-fade over 9 frames. The first scene has no fade-in.

## Rules this world keeps

- Frame zero of every scene already shows its subject (ghosted). No title over empty space.
- No same-size card grids, no eyebrows, no gradient text, no glass, no hard offset shadows.
- Text is never smaller than 24 px at 1080p except the plate number and ghost labels, which are not
  content.
- Illustrative values are labelled illustrative on screen.

## Scene library

| Scene     | Use                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `diagram` | A handbook `.mmd` diagram, laid out by ELK, built up in steps with a camera.                                                       |
| `anatomy` | Code or a message on the left; each part bracketed to a note on the right.                                                         |
| `hazards` | A system map with numbered hazards and a key.                                                                                      |
| `recap`   | Three statements, each beside a small drawing of the idea.                                                                         |
| `custom`  | A module-specific scene in `src/scenes/mcp/`: the opening failure story, the integration gap, who decides, and the two transports. |
