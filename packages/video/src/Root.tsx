import React from "react";
import { Composition } from "remotion";
import { Video, totalFrames } from "./Video.tsx";
import { withAudio } from "./videos/audio.ts";
import { MANIFESTS } from "./videos/manifests.ts";
import { scripts } from "./videos/registry.ts";
import { withTiming } from "./videos/timing.ts";
import { size } from "./theme.ts";

/**
 * Two compositions per video: `module-<slug>`, the silent cut that renders from the script alone,
 * and `module-<slug>-narrated`, which needs `public/narration/<slug>/` from running `narrate`.
 */
export const Root: React.FC = () => (
  <>
    {Object.entries(scripts).flatMap(([slug, script]) => {
      const manifest = MANIFESTS[slug];
      const narrated = manifest
        ? withTiming(withAudio(script, manifest.audio), manifest.timing)
        : script;
      return [
        <Composition
          key={slug}
          id={`module-${slug}`}
          component={Video}
          defaultProps={{ script }}
          durationInFrames={totalFrames(script, size.fps)}
          fps={size.fps}
          width={size.width}
          height={size.height}
        />,
        <Composition
          key={`${slug}-narrated`}
          id={`module-${slug}-narrated`}
          component={Video}
          defaultProps={{ script: narrated }}
          durationInFrames={totalFrames(narrated, size.fps)}
          fps={size.fps}
          width={size.width}
          height={size.height}
        />,
      ];
    })}
  </>
);
