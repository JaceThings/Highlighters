import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSelectionStyle } from "../selection-style.tsx";
import { buildFaviconDataUrl } from "../lib/favicon-svg.ts";
import { faviconLightOnly } from "../lib/favicon-query.ts";

function ensureLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link#dyn-favicon");
  if (!link) {
    link = document.createElement("link");
    link.id = "dyn-favicon";
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.appendChild(link);
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
    const raf = requestAnimationFrame(() => {
      link.href = buildFaviconDataUrl(style.color, style.pen, lightOnly);
    });
    return () => cancelAnimationFrame(raf);
  }, [style.color, style.pen, lightOnly]);
  return null;
}
