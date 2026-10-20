/**
 * Listens to a video's narration and records when each word is spoken, using whisper.cpp through
 * Remotion's installer. The timings drive two things: reveals land on the words that explain them
 * (`cue` phrases in the script), and captions get real timestamps.
 *
 *   node --experimental-strip-types scripts/transcribe.ts 06-mcp [--model medium.en] [--scene roles] [--force]
 *
 * Needs narration first (`narrate`), a C++ toolchain for the one-time whisper.cpp build, and
 * ffmpeg on the PATH. whisper.cpp and the model are cached under `.whisper/` (not committed).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
} from "@remotion/install-whisper-cpp";
import { withAudio, type AudioManifest } from "../src/videos/audio.ts";
import { scripts } from "../src/videos/registry.ts";
import { EMPTY_TIMING, withTiming, type TimingManifest, type Word } from "../src/videos/timing.ts";

const WHISPER_VERSION = "1.5.5";
type Model = "tiny.en" | "base.en" | "small.en" | "medium.en";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: "medium.en" },
    scene: { type: "string" },
    force: { type: "boolean", default: false },
  },
});

const slug = positionals[0];
const script = slug ? scripts[slug] : undefined;
if (!slug || !script) {
  process.stderr.write(
    `Usage: transcribe <slug>. Known videos: ${Object.keys(scripts).join(", ")}\n`,
  );
  process.exit(2);
}

const audioPath = resolve(pkg, `src/videos/${slug}.audio.json`);
const timingPath = resolve(pkg, `src/videos/${slug}.timing.json`);
if (!existsSync(audioPath)) {
  process.stderr.write(`No narration manifest for ${slug}. Run narrate first.\n`);
  process.exit(2);
}
const audio = JSON.parse(readFileSync(audioPath, "utf8")) as AudioManifest;
const spoken = withAudio(script, audio);
const previous: TimingManifest = existsSync(timingPath)
  ? (JSON.parse(readFileSync(timingPath, "utf8")) as TimingManifest)
  : EMPTY_TIMING;

const whisperPath = resolve(pkg, ".whisper");
mkdirSync(whisperPath, { recursive: true });
await installWhisperCpp({ to: whisperPath, version: WHISPER_VERSION, printOutput: false });
await downloadWhisperModel({
  model: values.model as Model,
  folder: whisperPath,
  printOutput: false,
});

const next: TimingManifest = { scenes: { ...previous.scenes } };
const tmp = resolve(pkg, ".whisper/tmp");
mkdirSync(tmp, { recursive: true });

for (const scene of spoken.scenes) {
  if (values.scene && scene.id !== values.scene) continue;
  if (!scene.audio) {
    process.stdout.write(`${scene.id.padEnd(12)} no narration yet, skipped\n`);
    continue;
  }
  const expected = audio.scenes[scene.id]!.textHash;
  if (!values.force && previous.scenes[scene.id]?.textHash === expected) {
    process.stdout.write(`${scene.id.padEnd(12)} unchanged\n`);
    continue;
  }
  // whisper.cpp reads 16 kHz mono WAV.
  const wav = resolve(tmp, `${scene.id}.wav`);
  const converted = spawnSync(
    "ffmpeg",
    ["-y", "-i", resolve(pkg, "public", scene.audio), "-ar", "16000", "-ac", "1", wav],
    {
      stdio: "ignore",
    },
  );
  if (converted.status !== 0)
    throw new Error(`ffmpeg could not convert ${scene.audio}; is ffmpeg installed?`);

  const output = await transcribe({
    inputPath: wav,
    whisperPath,
    whisperCppVersion: WHISPER_VERSION,
    model: values.model as Model,
    tokenLevelTimestamps: true,
    language: "en",
    splitOnWord: true,
  });
  const { captions } = toCaptions({ whisperCppOutput: output });
  const words: Word[] = captions
    .map((c) => ({ text: c.text.trim(), startMs: c.startMs, endMs: c.endMs }))
    .filter((w) => w.text.length > 0);
  next.scenes[scene.id] = { textHash: expected, words };
  process.stdout.write(`${scene.id.padEnd(12)} ${words.length} words\n`);
  writeFileSync(timingPath, `${JSON.stringify(next, null, 2)}\n`);
}

writeFileSync(timingPath, `${JSON.stringify(next, null, 2)}\n`);

// Say which cues did not land, so a mistimed reveal is a reworded phrase and not a mystery.
const missed: string[] = [];
withTiming(spoken, next, missed);
if (missed.length > 0) {
  process.stdout.write(
    `\n${missed.length} cue phrase(s) not heard; those reveals keep their estimated time:\n`,
  );
  for (const line of missed) process.stdout.write(`  ${line}\n`);
} else {
  process.stdout.write("\nEvery cue phrase was found.\n");
}
