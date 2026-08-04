/**
 * TypeScript mirror of the brand colors in `tokens.css`, for consumers that
 * cannot read CSS custom properties at the time they need a color value
 * (e.g. initializing Mermaid's JS theme before it renders into the DOM).
 * Keep in sync with `tokens.css` by hand — there are few enough entries that
 * a build-time generator would add more risk than it removes.
 */
export const brand = {
  50: "#eef1ff",
  100: "#e0e4ff",
  200: "#c6cbff",
  300: "#a4a4ff",
  400: "#8577f7",
  500: "#6c5ce7",
  600: "#4f46e5",
  700: "#4038c7",
  800: "#342e9e",
  900: "#211c6a",
  950: "#14113f",
} as const;

export type CalloutVariant =
  "info" | "accent" | "success" | "warning" | "danger" | "neutral" | "highlight" | "purple";
