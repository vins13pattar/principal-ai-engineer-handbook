import { SCENE_PAD_SECONDS, sceneSeconds, type VideoScript } from "./types.ts";

function clock(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** YouTube chapters: the first must be 0:00, there must be at least three, each at least 10 s. */
export function chapters(script: VideoScript): { at: string; title: string }[] {
  let cursor = 0;
  const out = script.scenes.map((scene) => {
    const chapter = { at: clock(cursor), title: scene.headline };
    cursor += sceneSeconds(scene);
    return chapter;
  });
  const short = script.scenes.find((scene) => sceneSeconds(scene) < 10 + SCENE_PAD_SECONDS);
  if (out.length < 3) throw new Error("YouTube needs at least three chapters");
  if (short) throw new Error(`Scene "${short.id}" is under 10 seconds, too short for a chapter`);
  return out;
}

export function youtubeTitle(script: VideoScript): string {
  return `${script.tag.replace("MODULE", "Module")}: ${script.youtube.titleSuffix}`;
}

/** The description to paste into YouTube: summary, links, chapters, and the standing disclosure. */
export function youtubeDescription(script: VideoScript): string {
  const links = script.youtube.links.map((l) => `${l.label}: ${l.url}`);
  const marks = chapters(script).map((c) => `${c.at} ${c.title}`);
  return [
    script.youtube.summary,
    "",
    ...links,
    "",
    "Chapters",
    ...marks,
    "",
    "Narration is AI-generated.",
  ].join("\n");
}
