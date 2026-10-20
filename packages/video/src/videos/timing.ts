import type { Scene, VideoScript } from "./types.ts";
import { SCENE_PAD_SECONDS, sceneSeconds } from "./types.ts";

/** One spoken word and when it is said, in milliseconds from the start of its scene's audio. */
export interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

/** What `scripts/transcribe.ts` records: the recognised words for each scene's audio. */
export interface TimingManifest {
  scenes: Record<string, { textHash: string; words: Word[] }>;
}

export const EMPTY_TIMING: TimingManifest = { scenes: {} };

/** How long before the word a visual should arrive, so the eye is there when the ear is. */
export const CUE_LEAD_SECONDS = 0.25;

const MIN_MATCH = 0.75;

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Finds when a phrase is spoken: the start of the best window of recognised words whose tokens
 * match the phrase's, tolerating a miss or two because recognition is not exact. Returns null when
 * nothing matches well enough, and the caller keeps its estimate rather than guessing.
 */
export function findPhrase(words: Word[], phrase: string): number | null {
  const want = tokens(phrase);
  if (want.length === 0) return null;
  const heard = words.map((w) => tokens(w.text).join(""));
  let best = { score: 0, index: -1 };
  for (let i = 0; i + want.length <= heard.length; i++) {
    let hits = 0;
    for (let j = 0; j < want.length; j++) if (heard[i + j] === want[j]!.replace(/'/g, "")) hits++;
    const score = hits / want.length;
    if (score > best.score) best = { score, index: i };
  }
  return best.score >= MIN_MATCH && best.index >= 0 ? words[best.index]!.startMs : null;
}

function toFraction(startMs: number, scene: Scene): number {
  const total = sceneSeconds(scene);
  const seconds = Math.max(0, startMs / 1000 - CUE_LEAD_SECONDS);
  return Math.min(Math.max(seconds / total, 0), 0.98);
}

/** Replaces estimated reveal positions with the moments the narration actually says them. */
function cueScene(scene: Scene, words: Word[], missed: string[]): Scene {
  const resolve = (phrase: string | undefined, fallback: number): number => {
    if (!phrase) return fallback;
    const at = findPhrase(words, phrase);
    if (at === null) {
      missed.push(`${scene.id}: "${phrase}"`);
      return fallback;
    }
    return toFraction(at, scene);
  };
  switch (scene.kind) {
    case "diagram":
      return {
        ...scene,
        steps: scene.steps.map((step) => ({ ...step, at: resolve(step.cue, step.at) })),
      };
    case "cards":
      return {
        ...scene,
        at: scene.at.map((at, i) => resolve(scene.cues?.[i], at)),
        ...(scene.footerCue ? { footerAt: resolve(scene.footerCue, scene.footerAt ?? 0.88) } : {}),
      };
    case "anatomy":
      return {
        ...scene,
        notes: scene.notes.map((note) => ({ ...note, at: resolve(note.cue, note.at) })),
      };
    case "compare":
      return { ...scene, at: scene.at.map((at, i) => resolve(scene.cues?.[i], at)) };
    default:
      return scene;
  }
}

/**
 * Cues every scene that has timings. `missed` lists phrases that were not found, so the transcribe
 * step can say which cue to reword instead of leaving a visual quietly mistimed.
 */
export function withTiming(
  script: VideoScript,
  timing: TimingManifest,
  missed: string[] = [],
): VideoScript {
  return {
    ...script,
    scenes: script.scenes.map((scene) => {
      const heard = timing.scenes[scene.id];
      return heard ? cueScene(scene, heard.words, missed) : scene;
    }),
  };
}

export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Gives each *written* word a time. Captions show the page's wording ("MCP"), but the speech
 * recogniser heard what was spoken ("M C P"). Words that match are anchors; the ones between
 * anchors are spread evenly across the gap.
 */
export function alignWords(written: string, heard: Word[], audioMs: number): CaptionWord[] {
  const text = written.split(/\s+/).filter(Boolean);
  const norm = (w: string) => tokens(w).join("");
  const spoken = heard.map((w) => norm(w.text));
  const anchors: (Word | null)[] = new Array(text.length).fill(null);
  let cursor = 0;
  text.forEach((word, i) => {
    const key = norm(word);
    if (!key) return;
    for (let look = cursor; look < Math.min(cursor + 8, spoken.length); look++) {
      if (spoken[look] === key) {
        anchors[i] = heard[look]!;
        cursor = look + 1;
        return;
      }
    }
  });

  const out: CaptionWord[] = text.map((t) => ({ text: t, startMs: 0, endMs: 0 }));
  let i = 0;
  while (i < text.length) {
    const anchor = anchors[i];
    if (anchor) {
      out[i] = { text: text[i]!, startMs: anchor.startMs, endMs: anchor.endMs };
      i++;
      continue;
    }
    let j = i;
    while (j < text.length && !anchors[j]) j++;
    const from = i > 0 ? out[i - 1]!.endMs : 0;
    const to = j < text.length ? anchors[j]!.startMs : audioMs;
    const step = (to - from) / (j - i);
    for (let k = i; k < j; k++) {
      out[k] = {
        text: text[k]!,
        startMs: Math.round(from + step * (k - i)),
        endMs: Math.round(from + step * (k - i + 1)),
      };
    }
    i = j;
  }
  return out;
}

const MAX_LINE = 42;
const MAX_CUE_MS = 6000;

/** Groups timed words into caption cues of at most two lines, ending at sentence breaks when it can. */
export function captionCues(
  words: CaptionWord[],
): { startMs: number; endMs: number; text: string }[] {
  const cues: { startMs: number; endMs: number; text: string }[] = [];
  let group: CaptionWord[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const text = group.map((w) => w.text).join(" ");
    cues.push({
      startMs: group[0]!.startMs,
      endMs: group.at(-1)!.endMs,
      text: wrapTwoLines(text) ?? text,
    });
    group = [];
  };
  for (const word of words) {
    const next = [...group, word];
    const fits = wrapTwoLines(next.map((w) => w.text).join(" ")) !== null;
    const span = word.endMs - (group[0]?.startMs ?? word.startMs);
    if (group.length > 0 && (!fits || span > MAX_CUE_MS)) flush();
    group.push(word);
    if (/[.?!]$/.test(word.text) && group.length >= 3) flush();
  }
  flush();
  return cues;
}

/** Splits text into at most two lines of `MAX_LINE`, as evenly as it can; null when it cannot. */
function wrapTwoLines(text: string): string | null {
  if (text.length <= MAX_LINE) return text;
  const words = text.split(" ");
  let best: string | null = null;
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const gap = Math.abs(a.length - b.length);
    if (a.length <= MAX_LINE && b.length <= MAX_LINE && gap < bestGap) {
      best = `${a}\n${b}`;
      bestGap = gap;
    }
  }
  return best;
}

function stamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = String(Math.floor(total / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((total % 3_600_000) / 60_000)).padStart(2, "0");
  const s = String(Math.floor((total % 60_000) / 1000)).padStart(2, "0");
  const milli = String(total % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${milli}`;
}

/** SubRip captions for the whole video, each scene offset to where it starts in the cut. */
export function toSrt(
  script: VideoScript,
  timing: TimingManifest,
  audioSeconds: (scene: Scene) => number,
): string {
  let offsetMs = 0;
  const lines: string[] = [];
  let n = 1;
  for (const scene of script.scenes) {
    const heard = timing.scenes[scene.id];
    if (heard) {
      const words = alignWords(scene.narration, heard.words, audioSeconds(scene) * 1000);
      for (const cue of captionCues(words)) {
        lines.push(
          String(n++),
          `${stamp(offsetMs + cue.startMs)} --> ${stamp(offsetMs + cue.endMs)}`,
          cue.text,
          "",
        );
      }
    }
    offsetMs += sceneSeconds(scene) * 1000;
  }
  return lines.join("\n");
}

export { SCENE_PAD_SECONDS };
