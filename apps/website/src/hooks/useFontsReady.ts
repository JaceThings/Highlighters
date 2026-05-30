import { useEffect, useState } from "react";

/**
 * `true` once the document's web fonts have loaded (or immediately when there is
 * no Font Loading API / fonts are already loaded / on the server).
 *
 * Gating a highlight mark on this avoids the flash-of-unstyled-text trap: if a
 * mark measures the text's line box while a fallback font is still showing, it
 * captures the wrong width/height, then the real font swaps in and the mark
 * resizes mid-entrance. Waiting for fonts means the first (and only) measurement
 * is the final one.
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(() => {
    if (typeof document === "undefined") return true;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    return !fonts || fonts.status === "loaded";
  });

  useEffect(() => {
    if (ready) return;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts || typeof fonts.ready?.then !== "function") {
      setReady(true);
      return;
    }
    let cancelled = false;
    fonts.ready.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}
