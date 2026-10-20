/**
 * Prints what to paste into YouTube for a video: title, description with chapters, and tags.
 * Chapter times come from the narrated lengths when they exist, so run it after `narrate`.
 *
 *   node --experimental-strip-types scripts/youtube.ts 06-mcp [--out out/06-mcp.youtube.md]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { withAudio, type AudioManifest } from "../src/videos/audio.ts";
import { scripts } from "../src/videos/registry.ts";
import { youtubeDescription, youtubeTitle } from "../src/videos/youtube.ts";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" } },
});

const slug = positionals[0];
const base = slug ? scripts[slug] : undefined;
if (!slug || !base) {
  process.stderr.write(`Usage: youtube <slug>. Known videos: ${Object.keys(scripts).join(", ")}\n`);
  process.exit(2);
}
const audioPath = resolve(pkg, `src/videos/${slug}.audio.json`);
const audio = existsSync(audioPath)
  ? (JSON.parse(readFileSync(audioPath, "utf8")) as AudioManifest)
  : null;
const script = audio ? withAudio(base, audio) : base;
const measured = audio !== null && Object.keys(audio.scenes).length === base.scenes.length;

const text = [
  `# ${youtubeTitle(script)}`,
  "",
  measured
    ? "Chapter times use the narrated lengths."
    : "WARNING: chapter times use word-count estimates. Run narrate first, then re-run this.",
  "",
  "## Description",
  "",
  "```text",
  youtubeDescription(script),
  "```",
  "",
  "## Tags",
  "",
  script.youtube.tags.join(", "),
  "",
].join("\n");

const out = resolve(pkg, values.out ?? `out/${slug}.youtube.md`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text);
process.stdout.write(`${text}\nWritten to ${out}\n`);
