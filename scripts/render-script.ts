/**
 * Re-render an episode's audio from a script already on disk.
 *
 * Synthesis is local and free; the model calls are the expensive half and their
 * output is already in `script.json`. So a change to voices, to speaking rate,
 * or to which turns get spoken costs nothing to re-run — there is no reason to
 * pay a model again to hear it.
 *
 * Usage:
 *   node --experimental-strip-types scripts/render-script.ts \
 *     .podcast/module-06-mcp/<run>/script.json
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { createLocalTts } from "@handbook/podcast-providers";
import { parseConfig, renderEpisode } from "@handbook/podcast-engine";
import type { DialogueScript } from "@handbook/podcast-engine";

const scriptPath = process.argv[2];
if (scriptPath === undefined) {
  console.error("usage: render-script.ts <script.json>");
  process.exit(2);
}

const root = process.cwd();
const config = parseConfig(JSON.parse(await readFile(join(root, "podcast.config.json"), "utf8")));
const script = JSON.parse(await readFile(scriptPath, "utf8")) as DialogueScript;

const runner = config.tts.runner;
const tts = createLocalTts({
  name: runner.name,
  command: runner.command,
  args: runner.args,
  ...(runner.cwd === undefined
    ? {}
    : { cwd: isAbsolute(runner.cwd) ? runner.cwd : join(root, runner.cwd) }),
  ...(runner.mediaType === undefined ? {} : { mediaType: runner.mediaType }),
  ...(runner.timeoutSeconds === undefined ? {} : { timeoutSeconds: runner.timeoutSeconds }),
});

console.log(`rendering ${script.turns.length} turns`);

const episode = await renderEpisode(script, tts, {
  voices: config.tts.voices,
  language: config.tts.language,
  onTurn: (index, total, speaker) => console.log(`  turn ${index + 1}/${total} (${speaker})`),
});

const out = join(dirname(scriptPath), "episode.wav");
await writeFile(out, episode.audio);

console.log(`\nwrote ${out}`);
console.log(
  `${Math.round(episode.audioSeconds ?? 0)}s of audio, ${episode.usage.speechCharacters} chars`,
);
