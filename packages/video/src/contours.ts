/**
 * Authored topographic contours for the plate ground: nested closed curves around a few summits.
 * Deterministic from a seed, so a re-render of unchanged content is identical. This is geometry,
 * not an imitation of a picture.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Summit {
  cx: number;
  cy: number;
  rings: string[];
}

function ring(cx: number, cy: number, radius: number, wobble: number[], phase: number[]): string {
  const points: string[] = [];
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r =
      radius *
      (1 +
        wobble[0]! * Math.sin(2 * a + phase[0]!) +
        wobble[1]! * Math.sin(3 * a + phase[1]!) +
        wobble[2]! * Math.sin(5 * a + phase[2]!));
    points.push(`${(cx + Math.cos(a) * r * 1.25).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

export function summits(seed: number, count: number, width: number, height: number): Summit[] {
  const rand = rng(seed * 7919 + 13);
  return Array.from({ length: count }, () => {
    const cx = rand() * width;
    const cy = rand() * height;
    const wobble = [0.05 + rand() * 0.05, 0.03 + rand() * 0.04, 0.015 + rand() * 0.02];
    const phase = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
    const base = 70 + rand() * 60;
    return {
      cx,
      cy,
      rings: Array.from({ length: 8 }, (_, i) => ring(cx, cy, base + i * 46, wobble, phase)),
    };
  });
}
