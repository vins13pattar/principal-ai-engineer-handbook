/**
 * Renders (or stills) one module's video by slug, so nobody has to remember composition ids.
 *
 *   node --experimental-strip-types scripts/render-module.ts 06-mcp [--narrated] [--scale 2]
 *        [--frames 0-299] [--still 640] [--out out/06-mcp.mp4]
 *
 * Any unknown flags are passed through to Remotion. Set REMOTION_BROWSER to a Chrome path (and
 * REMOTION_CHROME_MODE=headless-shell) to render in a container without a regular Chrome.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { scripts } from "../src/videos/registry.ts";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    narrated: { type: "boolean", default: false },
    scale: { type: "string" },
    frames: { type: "string" },
    still: { type: "string" },
    out: { type: "string" },
  },
});

const slug = positionals[0];
if (!slug || !scripts[slug]) {
  process.stderr.write(
    `Usage: render-module <slug>. Known videos: ${Object.keys(scripts).sort().join(", ")}\n`,
  );
  process.exit(2);
}
const id = `module-${slug}${values.narrated ? "-narrated" : ""}`;
const extra = process.argv.slice(2).filter((arg, i, all) => {
  const flagged = ["--narrated", "--scale", "--frames", "--still", "--out"];
  const prev = all[i - 1];
  return (
    arg !== slug &&
    !flagged.includes(arg) &&
    !(prev && flagged.includes(prev) && prev !== "--narrated")
  );
});

const browser = process.env["REMOTION_BROWSER"]
  ? [
      `--browser-executable=${process.env["REMOTION_BROWSER"]}`,
      `--chrome-mode=${process.env["REMOTION_CHROME_MODE"] ?? "headless-shell"}`,
    ]
  : [];

const still = values.still !== undefined;
const out = String(
  values.out ??
    (still
      ? `out/${slug}-${values.still}.png`
      : `out/${slug}${values.narrated ? "" : "-silent"}.mp4`),
);
const args = [
  "exec",
  "remotion",
  still ? "still" : "render",
  "src/index.ts",
  id,
  out,
  ...(still ? [`--frame=${values.still}`] : []),
  ...(!still && values.frames ? [`--frames=${values.frames}`] : []),
  ...(values.scale ? [`--scale=${values.scale}`] : []),
  ...browser,
  ...extra,
];
const result = spawnSync("pnpm", args, { cwd: pkg, stdio: "inherit" });
process.exit(result.status ?? 1);
