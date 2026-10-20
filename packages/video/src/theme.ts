/** Brand tokens, mirrored from packages/ui/src/tokens.css so the videos match the handbook. */
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
  ink: "#ffffff",
  mute: "#9aa0d6",
  // Semantic accents. Each is paired with a label or icon, never used as the only signal.
  danger: "#ff6b81",
  success: "#4cd4a0",
  warn: "#ffb86b",
} as const;

export const size = {
  width: 1920,
  height: 1080,
  fps: 30,
  margin: 96,
  /** Space reserved above and below the content area for the header and progress bar. */
  top: 190,
  bottom: 110,
} as const;

export const fontStack = {
  sans: `"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
  mono: `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace`,
} as const;
