/**
 * Measure a local TTS model on the machine you will actually run it on.
 *
 * Every recommendation about which local model suits a laptop is made without
 * access to that laptop, including the one in this package's README. Real-time
 * factor depends on the chip, the memory, the runner, the quantisation, and
 * what else is open. So this measures instead of quoting, and prints the
 * episode-level projection that turns a benchmark into a decision.
 *
 *   node --experimental-strip-types packages/podcast-providers/src/bench.ts \
 *     --name kokoro-82m --command .venv/bin/python \
 *     --args "-u,runners/kokoro_mlx.py,--text,{text},--out,{out},--voice,{voice}" \
 *     --voice af_heart --save /tmp/sample.wav
 *
 * `{text}` and `{out}` are substituted. Arguments are passed as argv, never
 * through a shell.
 *
 * It sweeps several call sizes rather than repeating one, because a local
 * runner has two costs and one call size cannot separate them. `createLocalTts`
 * spawns a process per call, so model load is paid every time; measured at a
 * single length that fixed cost hides inside the RTF and then gets multiplied
 * by the episode length as if it scaled. It does not. The sweep is what makes
 * the projection mean something.
 */

import { writeFile } from "node:fs/promises";
import {
  createLocalTts,
  estimateSpokenSeconds,
  fitSynthesisCost,
  projectRenderSeconds,
  realTimeFactor,
  wavDurationSeconds,
  type CostSample,
} from "./local.ts";
import { DEFAULT_LANGUAGE } from "./language.ts";

/** ~730 characters: long enough that a sentence-level runner has real work to do. */
const SAMPLE = [
  "An evaluation platform's job is not to produce a number.",
  "It is to say whether a difference between two numbers is real.",
  "At an eighty-five percent baseline, detecting a three point improvement takes",
  "two thousand and thirty three examples per arm, at ninety five percent confidence",
  "and eighty percent power. A fifty example set cannot resolve anything below",
  "roughly twenty percentage points, so every smaller movement it reports is noise",
  "being read as signal. The same data that shows a four point gain is consistent",
  "with a ten point regression. The point estimate on its own is not a measurement.",
  "That is the uncomfortable part, and it is why the honest answer to whether a",
  "change helped is sometimes that this dataset cannot tell.",
].join(" ");

/** Call sizes as multiples of SAMPLE. Needs at least two to fit two terms. */
const MULTIPLES = [1, 2, 4, 6];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const name = arg("name");
const command = arg("command");
const argsTemplate = arg("args");

if (!name || !command || !argsTemplate) {
  console.error("usage: bench.ts --name <label> --command <exe> --args <comma,separated,argv>");
  console.error("       placeholders: {text} {voice} {language} {speed} {out}");
  process.exit(2);
}

const tts = createLocalTts({
  name,
  command,
  args: argsTemplate.split(","),
  ...(arg("media-type") === undefined ? {} : { mediaType: arg("media-type")! }),
});

const voice = arg("voice") ?? "default";
const speak = (text: string) => tts.synthesise({ text, voice, language: DEFAULT_LANGUAGE });

console.log(`benchmarking ${name} — ${MULTIPLES.length} call sizes\n`);

// The first call pays model download checks and a cold page cache. Report it,
// then discard it: it is a one-off, and averaging it into the fit would tilt
// the fixed term with a cost that is not paid again.
const cold = await speak(SAMPLE);
console.log(`  cold start: ${cold.elapsedSeconds.toFixed(1)}s for the first call, discarded\n`);

const samples: CostSample[] = [];
let estimated = false;
let longest: Uint8Array | null = null;

console.log("     chars     audio    compute    RTF");
for (const multiple of MULTIPLES) {
  const text = Array.from({ length: multiple }, () => SAMPLE).join(" ");
  const result = await speak(text);
  longest = result.audio;

  // Read the duration off the audio. Estimating it from character count is how
  // the previous version of this file reported every RTF ~15% optimistic: the
  // 14 chars/sec planning figure ran long against the voice being measured.
  const measured = wavDurationSeconds(result.audio);
  const audioSeconds = measured ?? estimateSpokenSeconds(text.length);
  if (measured === null) estimated = true;

  samples.push({ audioSeconds, elapsedSeconds: result.elapsedSeconds });
  console.log(
    `  ${String(text.length).padStart(8)}` +
      `  ${(audioSeconds.toFixed(1) + "s").padStart(8)}` +
      `  ${(result.elapsedSeconds.toFixed(2) + "s").padStart(9)}` +
      `  ${realTimeFactor(result.elapsedSeconds, audioSeconds).toFixed(3).padStart(6)}`,
  );
}

if (estimated) {
  console.log(
    `\n  ! durations estimated at 14 chars/sec — ${name} did not return parseable WAV,` +
      `\n    so every RTF above is a guess with a measurement's formatting.`,
  );
}

const cost = fitSynthesisCost(samples);
console.log(
  `\n  compute = ${cost.fixedSeconds.toFixed(2)}s per call` +
    ` + ${cost.marginalRtf.toFixed(3)} x seconds of audio`,
);
console.log(
  `  once loaded it runs ${(1 / cost.marginalRtf).toFixed(1)}x faster than real time;` +
    ` every call pays the ${cost.fixedSeconds.toFixed(1)}s again.`,
);

// The projection the decision actually needs. Segment count is a planner
// choice, and it moves the render time more than the model choice does.
const episodeMinutes = Number(arg("episode-minutes") ?? 40);
const audioSeconds = episodeMinutes * 60;
console.log(`\n  a ${episodeMinutes}-minute episode, by how it is cut up:\n`);
console.log("    segments    render    of which model load");
for (const segments of [1, 20, 60, 120]) {
  const seconds = projectRenderSeconds(cost, audioSeconds, segments);
  const loadShare = (segments * cost.fixedSeconds) / seconds;
  console.log(
    `    ${String(segments).padStart(8)}` +
      `  ${((seconds / 60).toFixed(1) + " min").padStart(8)}` +
      `  ${((loadShare * 100).toFixed(0) + "%").padStart(19)}`,
  );
}

const wholeEpisode = projectRenderSeconds(cost, audioSeconds, 1) / 60;
console.log(
  `\n  ` +
    (wholeEpisode < episodeMinutes * 0.25
      ? "comfortably viable; iterate locally without thinking about it"
      : wholeEpisode < episodeMinutes
        ? "viable, but a full re-render is a coffee break"
        : "slower than real time; usable for drafts, painful for a full episode"),
);
console.log(
  `  segment-level regeneration is the cost control, and the table above prices it:` +
    `\n  past a few dozen segments you are paying mostly to load the model.`,
);

if (longest && arg("save")) {
  await writeFile(arg("save")!, longest);
  console.log(`\n  wrote ${arg("save")} — listen to it before trusting any of the above`);
}
