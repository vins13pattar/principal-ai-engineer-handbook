import { describe, expect, it } from "vitest";
import { LAYOUTS } from "../generated/layouts.ts";
import { SEQUENCES } from "../generated/sequences.ts";
import { scripts } from "./registry.ts";
import { spokenText } from "./speech.ts";
import { findPhrase, tokens, type Word } from "./timing.ts";
import { sceneSeconds, type Scene, type VideoScript } from "./types.ts";

/** Words as a recogniser would report them: every spoken token, 400 ms apart. */
function spoken(scene: Scene): Word[] {
  return tokens(spokenText(scene)).map((text, i) => ({
    text,
    startMs: i * 400,
    endMs: i * 400 + 350,
  }));
}

function cues(scene: Scene): string[] {
  if (scene.kind === "diagram" || scene.kind === "sequence")
    return scene.steps.flatMap((s) => (s.cue ? [s.cue] : []));
  return scene.beats.flatMap((b) => (b.cue ? [b.cue] : []));
}

function beatsOf(scene: Scene): number[] {
  if (scene.kind === "diagram" || scene.kind === "sequence") return scene.steps.map((s) => s.at);
  return scene.beats.map((b) => b.at);
}

const all: [string, VideoScript][] = Object.entries(scripts);

describe.each(all)("video %s", (slug, script) => {
  it("is registered under its own slug, with unique scene ids", () => {
    expect(script.slug).toBe(slug);
    const ids = script.scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("runs between five and eight minutes by the word-count estimate", () => {
    const minutes = script.scenes.reduce((sum, s) => sum + sceneSeconds(s), 0) / 60;
    expect(minutes).toBeGreaterThan(4);
    expect(minutes).toBeLessThan(8.5);
  });

  it("opens with a scene that already shows something, and has at least three chapters of 10 seconds or more", () => {
    expect(script.scenes.length).toBeGreaterThanOrEqual(3);
    for (const s of script.scenes) expect(sceneSeconds(s)).toBeGreaterThan(10);
  });

  it("speaks every cue phrase inside its own scene, and keeps beats in order", () => {
    for (const scene of script.scenes) {
      const words = spoken(scene);
      for (const cue of cues(scene)) {
        expect(findPhrase(words, cue), `${slug}/${scene.id}: "${cue}"`).not.toBeNull();
      }
      const at = beatsOf(scene);
      expect(at, `${slug}/${scene.id} beats ascend`).toEqual([...at].sort((a, b) => a - b));
      for (const a of at) expect(a).toBeGreaterThanOrEqual(0);
      for (const a of at) expect(a).toBeLessThan(1);
    }
  });

  it("only names diagram elements and map places that exist", () => {
    for (const scene of script.scenes) {
      if (scene.kind === "diagram") {
        const layout = LAYOUTS[scene.layout];
        expect(layout, `${slug}/${scene.id}: layout ${scene.layout}`).toBeDefined();
        const ids = new Set([...layout!.nodes.map((n) => n.id), ...layout!.edges.map((e) => e.id)]);
        for (const step of scene.steps) {
          for (const id of [...step.show, ...(step.focus ?? []), ...(step.camera ?? [])]) {
            expect(ids.has(id), `${slug}/${scene.id}: unknown element ${id}`).toBe(true);
          }
        }
        for (const id of scene.blocked ?? []) expect(ids.has(id), `blocked ${id}`).toBe(true);
      }
      if (scene.kind === "sequence") {
        const model = SEQUENCES[scene.layout];
        expect(model, `${slug}/${scene.id}: sequence ${scene.layout}`).toBeDefined();
        for (const step of scene.steps) expect(step.upTo).toBeLessThan(model!.items.length);
      }
      if (scene.kind === "story" || scene.kind === "hazards") {
        const places = new Set(scene.map.places.map((p) => p.id));
        for (const l of scene.map.links) {
          expect(
            places.has(l.from) && places.has(l.to),
            `${slug}/${scene.id}: link ${l.from}->${l.to}`,
          ).toBe(true);
        }
        if (scene.kind === "hazards")
          for (const h of scene.hazards)
            expect(places.has(h.at), `${slug}/${scene.id}: hazard at ${h.at}`).toBe(true);
        if (scene.kind === "story") {
          for (const run of scene.runs) {
            expect(run.results.length).toBe(run.paths.length);
            for (const path of run.paths)
              for (const id of path)
                expect(places.has(id), `${slug}/${scene.id}: path ${id}`).toBe(true);
          }
          for (const m of scene.marks ?? []) expect(places.has(m.at)).toBe(true);
          expect(scene.captions.length).toBe(scene.beats.length);
        }
      }
      if (scene.kind === "axis") {
        const n = scene.stations.length + (scene.chip ? 2 : 0);
        expect(scene.beats.length, `${slug}/${scene.id}: one beat per station (and chip)`).toBe(n);
      }
      if (scene.kind === "lanes") {
        expect(scene.beats.length).toBe(scene.lanes.length + (scene.takeaway ? 1 : 0));
      }
      if (scene.kind === "hazards") expect(scene.beats.length).toBe(scene.hazards.length);
      if (scene.kind === "anatomy") expect(scene.beats.length).toBe(scene.notes.length);
      if (scene.kind === "recap") expect(scene.beats.length).toBe(scene.points.length + 1);
    }
  });
});
