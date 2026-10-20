import { cancelRender, continueRender, delayRender } from "remotion";
import interUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2";
import monoUrl from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2";

/**
 * The handbook's fonts, bundled with the project so a render never depends on a network fetch and
 * stays byte-identical across machines. Remotion waits for each before painting a frame.
 */
function load(family: string, url: string) {
  const handle = delayRender(`font ${family}`);
  new FontFace(family, `url(${url}) format("woff2")`, { weight: "100 900", style: "normal" })
    .load()
    .then((face) => {
      document.fonts.add(face);
      continueRender(handle);
    })
    .catch((error: unknown) => cancelRender(error));
}

load("Inter", interUrl);
load("JetBrains Mono", monoUrl);
