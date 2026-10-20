/**
 * Speaks a video's narration, one WAV per scene, and records how long each one is.
 *
 *   node --experimental-strip-types scripts/narrate.ts 06-mcp [--voice am_michael] [--speed 1]
 *        [--scene problem] [--force] [--dry-run]
 *
 * Runs on the machine that has the synthesis runner (Apple silicon for Kokoro) and reads the same
 * `podcast.config.json` the podcast engine uses, so one setup serves both. Scenes whose text,
 * voice, speed, and model are unchanged are skipped, which makes re-running after a script edit
 * cost only the scenes that changed. Audio goes to `public/narration/<slug>/`, which is not
 * committed; the manifest `src/videos/<slug>.audio.json` is.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createLocalTts, wavDurationSeconds } from "@handbook/podcast-providers";
import { parseConfig } from "@handbook/podcast-engine";
import { EMPTY_AUDIO, type AudioManifest } from "../src/videos/audio.ts";
import { scripts } from "../src/videos/registry.ts";
import { spokenText, textHash } from "../src/videos/speech.ts";
import { sceneSeconds } from "../src/videos/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    voice: { type: "string", default: "am_michael" },
    speed: { type: "string", default: "1" },
    scene: { type: "string" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const slug = positionals[0];
const script = slug ? scripts[slug] : undefined;
if (!slug || !script) {
  process.stderr.write(`Usage: narrate <slug>. Known videos: ${Object.keys(scripts).join(", ")}\n`);
  process.exit(2);
}
const speed = Number(values.speed);
if (!Number.isFinite(speed) || speed <= 0) {
  process.stderr.write(`--speed must be a positive number, got ${values.speed}\n`);
  process.exit(2);
}
const voice = values.voice ?? "am_michael";

const targets = script.scenes.filter((scene) => !values.scene || scene.id === values.scene);
if (values.scene && targets.length === 0) {
  process.stderr.write(`No scene "${values.scene}" in ${slug}\n`);
  process.exit(2);
}

if (values["dry-run"]) {
  let total = 0;
  for (const scene of targets) {
    const seconds = sceneSeconds(scene);
    total += seconds;
    process.stdout.write(
      `${scene.id.padEnd(12)} ${String(spokenText(scene).length).padStart(5)} chars  ~${seconds.toFixed(0)}s\n`,
    );
  }
  process.stdout.write(
    `total ~${(total / 60).toFixed(1)} min (word-count estimate; speech usually runs longer)\n`,
  );
  process.exit(0);
}

const configPath = resolve(root, "podcast.config.json");
if (!existsSync(configPath)) {
  process.stderr.write(
    "podcast.config.json not found. Copy podcast.config.example.json and see docs/PODCAST.md.\n",
  );
  process.exit(2);
}
const config = parseConfig(JSON.parse(readFileSync(configPath, "utf8")));
const runner = config.tts.runner;
if (!runner) {
  process.stderr.write(
    "podcast.config.json has no tts.runner, so there is nothing local to speak with.\n",
  );
  process.exit(2);
}
const model = config.tts.modelId;

const manifestPath = resolve(here, `../src/videos/${slug}.audio.json`);
const previous: AudioManifest = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, "utf8")) as AudioManifest)
  : EMPTY_AUDIO;
// A different voice, speed, or model invalidates every scene, not just the edited ones.
const sameSettings =
  previous.voice === voice && previous.speed === speed && previous.model === model;

const tts = createLocalTts({
  name: runner.name,
  command: runner.command,
  args: runner.args,
  ...(runner.mediaType ? { mediaType: runner.mediaType } : {}),
  ...(runner.timeoutSeconds ? { timeoutSeconds: runner.timeoutSeconds } : {}),
  ...(runner.cwd ? { cwd: resolve(root, runner.cwd) } : {}),
});

const outDir = resolve(here, `../public/narration/${slug}`);
mkdirSync(outDir, { recursive: true });

const next: AudioManifest = {
  voice,
  speed,
  model,
  scenes: sameSettings ? { ...previous.scenes } : {},
};

for (const scene of targets) {
  const hash = textHash(scene);
  const file = resolve(outDir, `${scene.id}.wav`);
  const kept = next.scenes[scene.id];
  if (!values.force && kept?.textHash === hash && existsSync(file)) {
    process.stdout.write(`${scene.id.padEnd(12)} unchanged (${kept.audioSeconds.toFixed(1)}s)\n`);
    continue;
  }
  const result = await tts.synthesise({
    text: spokenText(scene),
    voice,
    language: config.tts.language,
    speed,
  });
  const seconds = wavDurationSeconds(result.audio);
  if (seconds === null || seconds <= 0)
    throw new Error(`Could not read the duration of the audio for ${scene.id}`);
  writeFileSync(file, result.audio);
  next.scenes[scene.id] = {
    textHash: hash,
    audio: `narration/${slug}/${scene.id}.wav`,
    audioSeconds: Math.round(seconds * 100) / 100,
  };
  process.stdout.write(
    `${scene.id.padEnd(12)} ${seconds.toFixed(1)}s in ${result.elapsedSeconds.toFixed(1)}s\n`,
  );
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
}

writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
const spoken = Object.values(next.scenes).reduce((sum, s) => sum + s.audioSeconds, 0);
process.stdout.write(
  `${Object.keys(next.scenes).length}/${script.scenes.length} scenes narrated, ${(spoken / 60).toFixed(1)} min of audio\n`,
);
