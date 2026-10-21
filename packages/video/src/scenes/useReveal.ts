import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { enterProgress } from "../motion.ts";

/**
 * Entry progress (0..1, spring) for something revealed at `at` of the scene. `ghost` is how visible
 * it is before then, so a scene never starts empty: a placed element shows faintly, then lights.
 */
export function useReveal(at: number, ghost = 0) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const progress = enterProgress(frame, Math.round(at * durationInFrames), fps);
  return {
    progress,
    opacity: ghost + (1 - ghost) * Math.min(progress * 1.5, 1),
    lift: interpolate(progress, [0, 1], [18, 0]),
  };
}

/** Which beat is current, and how far into it, from a list of beat starts (fractions of the scene). */
export function useBeat(starts: number[]) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  let active = -1;
  for (let i = 0; i < starts.length; i++)
    if (frame >= Math.round(starts[i]! * durationInFrames)) active = i;
  const since = active < 0 ? 0 : frame - Math.round(starts[active]! * durationInFrames);
  return { active, since, frame, fps, durationInFrames };
}
