// Per-route SEO metadata shared across the SPA. Kept framework-free so a
// build/prerender step can import it without pulling in React.

export type RouteMeta = {
  title: string;
  description: string;
};

export const ROUTE_META = {
  "/": {
    title: "highlighters",
    description:
      "Realistic highlighter, underline, and strike-through marks for the web. Bindings for React, Vue, and Svelte.",
  },
  "/playground": {
    title: "playground — highlighters",
    description:
      "Build your own highlighter — tune color, ink, edge, tip, paper, glow, and animation live in your browser, then copy the config. Recommended looks are starting points, not a menu.",
  },
} as const satisfies Record<string, RouteMeta>;

export type CanonicalPath = keyof typeof ROUTE_META;

export const CANONICAL_PATHS: ReadonlySet<string> = new Set(
  Object.keys(ROUTE_META),
);

export const SITE_ORIGIN = "https://highlighte.rs";
