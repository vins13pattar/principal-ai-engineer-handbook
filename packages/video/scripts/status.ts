/**
 * One line per video: how long it should run, and how far along narration, timing and cues are.
 *
 *   node --experimental-strip-types scripts/status.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scripts } from "../src/videos/registry.ts";
import type { AudioManifest } from "../src/videos/audio.ts";
import type { TimingManifest } from "../src/videos/timing.ts";
import { sceneSeconds } from "../src/videos/types.ts";

const videos = resolve(dirname(fileURLToPath(import.meta.url)), "../src/videos");
const read = <T>(slug: string, kind: string): T | null => {
  const path = resolve(videos, `${slug}.${kind}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
};

process.stdout.write(`${"video".padEnd(34)} scenes  est.   words  narrated  timed\n`);
for (const slug of Object.keys(scripts).sort()) {
  const script = scripts[slug]!;
  const audio = read<AudioManifest>(slug, "audio");
  const timing = read<TimingManifest>(slug, "timing");
  const seconds = script.scenes.reduce((sum, s) => sum + sceneSeconds(s), 0);
  const words = script.scenes.reduce((sum, s) => sum + s.narration.trim().split(/\s+/).length, 0);
  const spoken = audio ? Object.keys(audio.scenes).length : 0;
  const timed = timing ? Object.keys(timing.scenes).length : 0;
  const n = script.scenes.length;
  process.stdout.write(
    `${slug.padEnd(34)} ${String(n).padStart(4)}  ${(seconds / 60).toFixed(1).padStart(5)}m ${String(words).padStart(6)}  ${`${spoken}/${n}`.padStart(8)}  ${`${timed}/${n}`.padStart(5)}\n`,
  );
}
