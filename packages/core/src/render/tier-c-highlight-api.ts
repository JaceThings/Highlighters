import type { Renderer, RenderContext } from "../types.js";
import { hasGlobal } from "../internal/dom.js";
import { detectHighlightApi } from "./tier-select.js";

const STYLE_ID = "highlighters-highlight-api-styles";

let highlightSeq = 0;

function getSharedStyle(doc: Document): HTMLStyleElement {
  const existing = doc.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}

export function createHighlightApiRenderer(): Renderer {
  const name = `highlighters-${++highlightSeq}`;
  const ownRule = new RegExp(`\\s*::highlight\\(${name}\\)\\s*\\{[^}]*\\}`, "g");
  let highlight: Highlight | null = null;
  let styleEl: HTMLStyleElement | null = null;

  function writeRule(rule: string): void {
    if (!styleEl) return;
    const base = (styleEl.textContent ?? "").replace(ownRule, "").trim();
    styleEl.textContent = base ? `${base}\n${rule}` : rule;
  }

  function render({ container, options, ranges }: RenderContext): void {
    if (detectHighlightApi()) {
      if (!highlight) CSS.highlights.set(name, (highlight = new Highlight()));
      else highlight.clear();
      for (const range of ranges) highlight.add(range);
    }

    const raw = String(options.color);
    const color = hasGlobal("CSS") && CSS.supports?.("color", raw) ? raw : "transparent";
    const alpha = Math.round(Math.max(0, Math.min(1, options.opacity)) * 100);
    styleEl ??= getSharedStyle(container.ownerDocument);
    writeRule(
      `::highlight(${name}) { background-color: color-mix(in srgb, ${color} ${alpha}%, transparent); color: inherit; }`,
    );
  }

  return {
    tier: "highlight-api",
    mount: render,
    update: render,
    bandFor: () => null,
    unmount(): void {
      if (detectHighlightApi()) CSS.highlights.delete(name);
      highlight = null;
      if (!styleEl) return;
      writeRule("");
      if (!styleEl.textContent?.trim()) styleEl.remove();
      styleEl = null;
    },
  };
}
