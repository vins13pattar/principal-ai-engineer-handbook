/**
 * Writes SubRip captions for a narrated video, timed from the recorded word timings and showing
 * the page's wording. Upload the file to YouTube alongside the video.
 *
 *   node --experimental-strip-types scripts/captions.ts 06-mcp [--out out/06-mcp.srt]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { withAudio, type AudioManifest } from "../src/videos/audio.ts";
import { scripts } from "../src/videos/registry.ts";
import { toSrt, type TimingManifest } from "../src/videos/timing.ts";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" } },
});

const slug = positionals[0];
const script = slug ? scripts[slug] : undefined;
if (!slug || !script) {
  process.stderr.write(
    `Usage: captions <slug>. Known videos: ${Object.keys(scripts).join(", ")}\n`,
  );
  process.exit(2);
}
const read = <T>(name: string): T | null => {
  const path = resolve(pkg, `src/videos/${slug}.${name}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
};
const audio = read<AudioManifest>("audio");
const timing = read<TimingManifest>("timing");
if (!audio || !timing || Object.keys(timing.scenes).length === 0) {
  process.stderr.write(
    `Captions need narration and timings. Run narrate, then transcribe, for ${slug}.\n`,
  );
  process.exit(2);
}

const spoken = withAudio(script, audio);
const lengths = new Map(spoken.scenes.map((s) => [s.id, s.audioSeconds ?? 0]));
const srt = toSrt(spoken, timing, (scene) => lengths.get(scene.id) ?? 0);

const out = resolve(pkg, values.out ?? `out/${slug}.srt`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${srt}\n`);
process.stdout.write(`${srt.split("\n\n").length - 1} caption cues written to ${out}\n`);
