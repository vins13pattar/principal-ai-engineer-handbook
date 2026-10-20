import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { enterProgress } from "../motion.ts";

/** Entry progress (0..1, spring) and a ready-made transform for something revealed at `at` of the scene. */
export function useReveal(at: number) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const progress = enterProgress(frame, Math.round(at * durationInFrames), fps);
  return {
    progress,
    style: {
      opacity: Math.min(progress * 1.5, 1),
      transform: `translateY(${interpolate(progress, [0, 1], [26, 0])}px) scale(${interpolate(progress, [0, 1], [0.97, 1])})`,
    } as const,
  };
}
