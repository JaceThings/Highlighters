import type { Renderer, RenderContext } from "../types.js";
import { hasGlobal } from "../internal/dom.js";

let highlightSeq = 0;

const STYLE_ID = "highlighters-highlight-api-styles";

function getSharedStyle(doc: Document): HTMLStyleElement {
  const existing = doc.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}

function highlightApiAvailable(): boolean {
  return (
    hasGlobal("CSS") &&
    "highlights" in CSS &&
    hasGlobal("Highlight")
  );
}

export function createHighlightApiRenderer(): Renderer {
  const name = `highlighters-${++highlightSeq}`;
  let highlight: Highlight | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let ruleText = "";

  function ruleFor(context: RenderContext): string {
    const { options } = context;
    const alpha = Math.max(0, Math.min(1, options.opacity));
    const raw = String(options.color);
    const color =
      hasGlobal("CSS") && CSS.supports?.("color", raw) ? raw : "transparent";
    const fill = `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
    const decls = [`background-color: ${fill}`, `color: inherit`];
    return `::highlight(${name}) { ${decls.join("; ")}; }`;
  }

  function register(ranges: Range[]): void {
    if (!highlightApiAvailable()) return;

    if (!highlight) {
      highlight = new Highlight();
      CSS.highlights.set(name, highlight);
    } else {
      highlight.clear();
    }
    for (const range of ranges) highlight.add(range);
  }

  function writeRule(context: RenderContext): void {
    const doc =
      context.container.ownerDocument ??
      (hasGlobal("document") ? document : null);
    if (!doc) return;
    styleEl ??= getSharedStyle(doc);
    ruleText = ruleFor(context);
    rewriteOwnRule();
  }

  function rewriteOwnRule(): void {
    if (!styleEl) return;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ownRule = new RegExp(`\\s*::highlight\\(${escaped}\\)\\s*\\{[^}]*\\}`, "g");
    const base = (styleEl.textContent ?? "").replace(ownRule, "").trim();
    styleEl.textContent = base ? `${base}\n${ruleText}` : ruleText;
  }

  return {
    tier: "highlight-api",

    mount(context: RenderContext): void {
      register(context.ranges);
      writeRule(context);
    },

    update(context: RenderContext): void {
      register(context.ranges);
      writeRule(context);
    },

    bandFor: (): HTMLElement | null => null,

    unmount(): void {
      if (highlightApiAvailable() && CSS.highlights.has(name)) {
        CSS.highlights.delete(name);
      }
      highlight = null;
      if (styleEl) {
        ruleText = "";
        rewriteOwnRule();
        if (!styleEl.textContent || styleEl.textContent.trim() === "") {
          styleEl.remove();
        }
        styleEl = null;
      }
    },
  };
}
