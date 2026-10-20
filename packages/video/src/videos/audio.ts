import { textHash } from "./speech.ts";
import type { VideoScript } from "./types.ts";

/** What `scripts/narrate.ts` records for a video: one entry per scene it has spoken. */
export interface AudioManifest {
  voice: string | null;
  speed: number | null;
  model: string | null;
  scenes: Record<string, { textHash: string; audio: string; audioSeconds: number }>;
}

export const EMPTY_AUDIO: AudioManifest = { voice: null, speed: null, model: null, scenes: {} };

/**
 * Attaches measured narration to a script. A scene with no entry keeps its word-count estimate, so
 * a half-narrated video still renders; a scene whose text changed since it was spoken is refused,
 * because audio that no longer matches the page is worse than no audio.
 */
export function withAudio(script: VideoScript, manifest: AudioManifest): VideoScript {
  return {
    ...script,
    scenes: script.scenes.map((scene) => {
      const spoken = manifest.scenes[scene.id];
      if (!spoken) return scene;
      if (spoken.textHash !== textHash(scene)) {
        throw new Error(
          `Narration for "${scene.id}" is stale: its text changed. Run narrate again.`,
        );
      }
      return { ...scene, audio: spoken.audio, audioSeconds: spoken.audioSeconds };
    }),
  };
}
