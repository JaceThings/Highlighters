import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSelectionStyle } from "../selection-style.tsx";
import { buildFaviconDataUrl } from "../lib/favicon-svg.ts";
import { faviconLightOnly } from "../lib/favicon-query.ts";

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

const DARK_FAVICON_MEDIA = "(prefers-color-scheme: dark)";

function setStaticFaviconLightOnly(lightOnly: boolean) {
  document
    .querySelectorAll<HTMLLinkElement>(`link[rel="icon"][media="${DARK_FAVICON_MEDIA}"]`)
    .forEach((el) => {
      el.media = lightOnly ? "not all" : DARK_FAVICON_MEDIA;
    });
}

export function DynamicFavicon() {
  const { style } = useSelectionStyle();
  // Re-read on navigation; TanStack `location.search` is a typed object, not the query string.
  const locationKey = useRouterState({ select: (s) => s.location.href });
  const lightOnly = faviconLightOnly(
    locationKey.includes("?") ? locationKey.slice(locationKey.indexOf("?")) : "",
  );

  useEffect(() => {
    setStaticFaviconLightOnly(lightOnly);
    return () => setStaticFaviconLightOnly(false);
  }, [lightOnly]);

  useEffect(() => {
    const link = ensureLink();
    // Coalesce to one swap per frame: a rapid colour drag re-runs this effect, cancelling the
    // pending frame and scheduling the latest. Unless `?favicon=light`, the SVG swaps via @media.
    const raf = requestAnimationFrame(() => {
      link.href = buildFaviconDataUrl(style.color, style.pen, lightOnly);
    });
    return () => cancelAnimationFrame(raf);
  }, [style.color, style.pen, lightOnly]);
  return null;
}
