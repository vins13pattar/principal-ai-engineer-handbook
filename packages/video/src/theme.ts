/**
 * The Atlas of Engineering world: a nautical night chart. Deep navy sea, indigo land with authored
 * contour lines, pale chart ink, one amber route colour for the active path, coral only for failure.
 * Brand indigo comes from packages/ui/src/tokens.css so the channel and the handbook share a family.
 */
export const color = {
  brand50: "#eef1ff",
  brand100: "#e0e4ff",
  brand200: "#c6cbff",
  brand300: "#a4a4ff",
  brand400: "#8577f7",
  brand500: "#6c5ce7",
  brand600: "#4f46e5",
  brand700: "#4038c7",
  brand800: "#342e9e",
  brand900: "#211c6a",
  brand950: "#14113f",
  /** The sea: ground of every plate. */
  sea: "#0b0a2c",
  seaLift: "#181449",
  /** Chart ink for text and linework. */
  ink: "#f3f4ff",
  inkSoft: "#c9cdf2",
  inkMute: "#9aa0d6",
  /** A place on the chart: the fill under a label. */
  place: "#1b1763",
  /** The active route: the one warm colour on the plate. */
  route: "#ffb454",
  /** Failure and hazard only, always paired with a label or mark. */
  fault: "#ff6b81",
  ok: "#4cd4a0",
} as const;

export const size = {
  width: 1920,
  height: 1080,
  fps: 30,
  /** Content sits inside the neatline, below the cartouche and above the route line. */
  margin: 96,
  top: 196,
  bottom: 96,
} as const;

export const fontStack = {
  /** Plate titles and place names. */
  display: `"Spectral", "Iowan Old Style", Georgia, serif`,
  /** Labels and running text. */
  sans: `"Source Sans 3", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
  /** Code, coordinates and plate numbers only. */
  mono: `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace`,
} as const;
