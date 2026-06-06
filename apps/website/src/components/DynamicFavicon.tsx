import { useEffect } from "react";
import { useSelectionStyle } from "../selection-style.tsx";
import { buildFaviconDataUrl } from "../lib/favicon-svg.ts";

// An SVG favicon that tracks the dock's live colour + nib. Chrome/Firefox honour the SVG icon and
// update it instantly; Safari ignores SVG icons and keeps the static PNG fallback in index.html.
function ensureLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link#dyn-favicon");
  if (!link) {
    link = document.createElement("link");
    link.id = "dyn-favicon";
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.appendChild(link); // last icon wins where SVG is supported
  }
  return link;
}

export function DynamicFavicon() {
  const { style } = useSelectionStyle();
  useEffect(() => {
    const link = ensureLink();
    // Coalesce to one swap per frame: a rapid colour drag re-runs this effect, cancelling the
    // pending frame and scheduling the latest. The SVG handles light/dark itself via @media.
    const raf = requestAnimationFrame(() => {
      link.href = buildFaviconDataUrl(style.color);
    });
    return () => cancelAnimationFrame(raf);
  }, [style.color]);
  return null;
}
