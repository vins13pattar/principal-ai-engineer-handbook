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
 *     --name kokoro-82m \
 *     --command uv \
 *     --args "run,--,mlx_audio.tts.generate,--text,{text},--file_prefix,{out}"
 *
 * `{text}` and `{out}` are substituted. Arguments are passed as argv, never
 * through a shell.
 */

import { writeFile } from "node:fs/promises";
import { createLocalTts, estimateSpokenSeconds, realTimeFactor } from "./local.ts";
import { DEFAULT_LANGUAGE } from "./language.ts";

/** ~1,200 characters: long enough that startup cost stops dominating. */
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

const runs = Number(arg("runs") ?? 3);
const tts = createLocalTts({
  name,
  command,
  args: argsTemplate.split(","),
  ...(arg("media-type") === undefined ? {} : { mediaType: arg("media-type")! }),
});

console.log(`benchmarking ${name} — ${runs} run(s), ${SAMPLE.length} characters each\n`);

const factors: number[] = [];
let lastAudio: Uint8Array | null = null;

for (let run = 1; run <= runs; run += 1) {
  const result = await tts.synthesise({
    text: SAMPLE,
    voice: arg("voice") ?? "default",
    language: DEFAULT_LANGUAGE,
  });
  lastAudio = result.audio;

  const spoken = estimateSpokenSeconds(SAMPLE.length);
  const factor = realTimeFactor(result.elapsedSeconds, spoken);
  factors.push(factor);

  console.log(
    `  run ${run}: ${result.elapsedSeconds.toFixed(1)}s compute for ~${spoken.toFixed(0)}s audio ` +
      `-> RTF ${factor.toFixed(2)}  (${(result.audio.length / 1024).toFixed(0)} KiB)`,
  );
}

// The first run pays model load; report it separately rather than letting it
// skew a mean that a decision gets made on.
const warm = factors.length > 1 ? factors.slice(1) : factors;
const meanWarm = warm.reduce((sum, value) => sum + value, 0) / warm.length;

console.log(`\n  cold RTF   ${factors[0]!.toFixed(2)}`);
console.log(`  warm RTF   ${meanWarm.toFixed(2)} (mean of ${warm.length})`);

const episodeMinutes = 40;
const renderMinutes = episodeMinutes * meanWarm;
console.log(
  `\n  a ${episodeMinutes}-minute episode renders in ~${renderMinutes.toFixed(0)} minutes`,
);
console.log(
  meanWarm < 0.25
    ? "  -> comfortably viable; iterate locally without thinking about it"
    : meanWarm < 1
      ? "  -> viable, but a full re-render is a coffee break; segment-level regeneration matters"
      : "  -> slower than real time; usable for drafts, painful for a full episode",
);

if (lastAudio && arg("save")) {
  await writeFile(arg("save")!, lastAudio);
  console.log(`\n  wrote ${arg("save")} — listen to it before trusting any of the above`);
}
