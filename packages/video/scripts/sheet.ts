/**
 * Renders review stills for one video and tiles them into contact sheets: for each scene, how it
 * opens, how it looks midway, and how it looks resolved. The opening frame is the one that matters
 * most, because an empty opening is exactly what a viewer clicks away from.
 *
 *   node --experimental-strip-types scripts/sheet.ts 06-mcp [--rows 3] [--narrated]
 *
 * Output: out/sheets/<slug>/sheet-1.png ... plus the full-size stills beside them. Bundles once.
 * Set REMOTION_BROWSER to a Chrome path in a container without a regular Chrome.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { scripts } from "../src/videos/registry.ts";
import { sceneSeconds } from "../src/videos/types.ts";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS = 30;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    rows: { type: "string", default: "3" },
    narrated: { type: "boolean", default: false },
  },
});
const slug = positionals[0];
const script = slug ? scripts[slug] : undefined;
if (!slug || !script) {
  process.stderr.write(
    `Usage: sheet <slug>. Known videos: ${Object.keys(scripts).sort().join(", ")}\n`,
  );
  process.exit(2);
}
const rows = Number(values.rows);

const dir = resolve(pkg, `out/sheets/${slug}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const serveUrl = await bundle({ entryPoint: resolve(pkg, "src/index.ts") });
const browserExecutable = process.env["REMOTION_BROWSER"] ?? null;
const chromeMode = (process.env["REMOTION_CHROME_MODE"] ?? "headless-shell") as
  "headless-shell" | "chrome-for-testing";
const id = `module-${slug}${values.narrated ? "-narrated" : ""}`;
const composition = await selectComposition({
  serveUrl,
  id,
  ...(browserExecutable ? { browserExecutable, chromeMode } : {}),
});

let cursor = 0;
const frames: { scene: string; label: string; frame: number }[] = [];
for (const scene of script.scenes) {
  const n = Math.round(sceneSeconds(scene) * FPS);
  for (const [label, f] of [
    ["open", 12],
    ["mid", 0.45],
    ["end", 0.92],
  ] as const) {
    const frame = cursor + (f < 1 ? Math.round(n * f) : f);
    frames.push({
      scene: scene.id,
      label,
      frame: Math.min(frame, composition.durationInFrames - 1),
    });
  }
  cursor += n;
}

let i = 0;
for (const f of frames) {
  i++;
  await renderStill({
    composition,
    serveUrl,
    frame: f.frame,
    output: resolve(dir, `${String(i).padStart(3, "0")}-${f.scene}-${f.label}.png`),
    ...(browserExecutable ? { browserExecutable, chromeMode } : {}),
  });
}

// Tile: three columns (open, mid, end) per scene, `rows` scenes per sheet.
const per = rows * 3;
const total = Math.ceil(frames.length / per);
for (let s = 0; s < total; s++) {
  const first = s * per + 1;
  const count = Math.min(per, frames.length - s * per);
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      "1",
      "-start_number",
      "0",
      "-pattern_type",
      "glob",
      "-i",
      `${dir}/*.png`,
      "-vf",
      `select='between(n\\,${first - 1}\\,${first - 1 + count - 1})',scale=640:360,tile=3x${Math.ceil(count / 3)}:padding=6:color=0x0b0a2c`,
      "-frames:v",
      "1",
      resolve(dir, `sheet-${s + 1}.png`),
    ],
    { stdio: "inherit" },
  );
}
process.stdout.write(`${frames.length} stills and ${total} sheet(s) in ${dir}\n`);
