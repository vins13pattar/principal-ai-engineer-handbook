import { spring, interpolate } from "remotion";

/** One motion language for every video: change these and the whole series changes. */
export const springs = {
  /** Elements arriving: a short, confident settle with almost no overshoot. */
  enter: { damping: 20, stiffness: 140, mass: 0.9 },
  /** Camera moves and re-focusing: critically damped, never bounces. */
  camera: { damping: 200, stiffness: 90, mass: 1.2 },
} as const;

/** Frames between sibling elements entering together. */
export const STAGGER = 5;

export function enterProgress(frame: number, start: number, fps: number): number {
  return spring({ frame: frame - start, fps, config: springs.enter });
}

export function cameraProgress(frame: number, start: number, fps: number): number {
  return spring({ frame: frame - start, fps, config: springs.camera });
}

export function fadeIn(frame: number, start: number, frames: number): number {
  return interpolate(frame, [start, start + frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}
