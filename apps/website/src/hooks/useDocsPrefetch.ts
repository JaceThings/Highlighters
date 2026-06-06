import { useEffect } from "react";
import { IS_WEBKIT } from "../components/docs/is-webkit.ts";

// Warm the /docs route from home while idle: JS chunk, quote font, WebKit-only paper raster.
export function useDocsPrefetch(): void {
  useEffect(() => {
    let warmed = false;
    const warm = () => {
      if (warmed) return;
      warmed = true;
      void import("../playground/DocsPlayground.tsx");
      // Fully load (not just cache) the font so /docs paints it with no swap reflow.
      void document.fonts?.load?.('400 25px "Letters Home"')?.catch(() => {});
      if (IS_WEBKIT) prefetchImage("/paper-sheet.webp");
    };
    const hasIdle = typeof window.requestIdleCallback === "function";
    const id = hasIdle ? window.requestIdleCallback(warm, { timeout: 2500 }) : window.setTimeout(warm, 1200);
    return () => {
      if (hasIdle) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, []);
}

function prefetchImage(href: string): void {
  const url = new URL(href, location.href).href;
  const already = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]')];
  if (already.some((l) => l.href === url)) return;
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "image";
  link.href = href;
  document.head.appendChild(link);
}
