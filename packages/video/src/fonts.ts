import { cancelRender, continueRender, delayRender } from "remotion";
import monoUrl from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2";
import sansItalicUrl from "@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-italic.woff2";
import sansUrl from "@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2";
import spectral600Italic from "@fontsource/spectral/files/spectral-latin-600-italic.woff2";
import spectral700 from "@fontsource/spectral/files/spectral-latin-700-normal.woff2";
import spectral800 from "@fontsource/spectral/files/spectral-latin-800-normal.woff2";

/**
 * The plate's typefaces, bundled with the project so a render never depends on a network fetch and
 * stays identical across machines. Remotion waits for each before painting a frame.
 */
function load(family: string, url: string, weight: string, style: "normal" | "italic" = "normal") {
  const handle = delayRender(`font ${family} ${weight} ${style}`);
  new FontFace(family, `url(${url}) format("woff2")`, { weight, style })
    .load()
    .then((face) => {
      document.fonts.add(face);
      continueRender(handle);
    })
    .catch((error: unknown) => cancelRender(error));
}

load("Spectral", spectral700, "700");
load("Spectral", spectral800, "800");
load("Spectral", spectral600Italic, "600", "italic");
load("Source Sans 3", sansUrl, "200 900");
load("Source Sans 3", sansItalicUrl, "200 900", "italic");
load("JetBrains Mono", monoUrl, "100 900");
