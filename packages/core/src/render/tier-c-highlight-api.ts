/**
 * Tier C renderer — the CSS Custom Highlight API (`::highlight()`).
 *
 * The maximally-safe tier (blueprint R26 / R29): registers the mark's `Range`s with
 * `CSS.highlights` and paints them via a generated `::highlight()` rule. Zero overlay
 * DOM, native multiline, find-in-page/selection unaffected, text nodes untouched.
 * The trade-off is fidelity — flat colour only, no edge organicness/texture/multiply
 * — but colour and coverage still match the other tiers (R28).
 *
 * Each instance owns one named `Highlight` registration and one CSS rule in a
 * shared `<style>`. `unmount()` deregisters and removes its rule, leaving the
 * document pristine (R9).
 */

import type { Renderer, RenderContext } from "../types.js";

/** Monotonic id source so concurrent marks never collide on a highlight name. */
let highlightSeq = 0;

const STYLE_ID = "highlighters-highlight-api-styles";

/** Lazily create (or return) the single shared `<style>` for all `::highlight()` rules. */
function getSharedStyle(doc: Document): HTMLStyleElement {
  const existing = doc.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}

/** Whether the Custom Highlight API is usable here; guarded for SSR/old engines (C1). */
function highlightApiAvailable(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight !== "undefined"
  );
}

/**
 * Create a Tier C renderer (`tier: "highlight-api"`). Paints the mark's originating
 * ranges in a flat colour: one rule in the shared stylesheet keyed by a unique
 * highlight name, plus a `Highlight` registered over the ranges.
 */
export function createHighlightApiRenderer(): Renderer {
  const name = `highlighters-${++highlightSeq}`;
  let highlight: Highlight | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let ruleText = "";

  function ruleFor(context: RenderContext): string {
    const { options } = context;
    // The Highlight API exposes no `opacity`/`mix-blend-mode` on `::highlight()`,
    // so fold opacity into the fill via `color-mix` to match Tiers A/B coverage
    // (R28). Blend mode is unavoidably dropped (no paintable property for it).
    const alpha = Math.max(0, Math.min(1, options.opacity));
    // options.color lands in stylesheet RULE TEXT (`styleEl.textContent`), not a
    // CSSOM setter, so it must be guarded against CSS injection: `CSS.supports`
    // accepts only a bare colour and rejects anything crafted to close `color-mix()`
    // and inject extra rules. Fall back to transparent.
    const raw = String(options.color);
    const color =
      typeof CSS !== "undefined" && CSS.supports?.("color", raw) ? raw : "transparent";
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
      (typeof document !== "undefined" ? document : null);
    if (!doc) return;
    styleEl ??= getSharedStyle(doc);
    ruleText = ruleFor(context);
    rewriteOwnRule();
  }

  /** Replace this renderer's rule in the shared sheet without disturbing others. */
  function rewriteOwnRule(): void {
    if (!styleEl) return;
    // Strip only THIS renderer's rule by pattern (others stay byte-intact), then
    // append the fresh one. `name` is escaped for regex safety.
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

    // No overlay DOM (paints via ::highlight()), so there's no wrapper to draw on.
    bandFor: (): HTMLElement | null => null,

    unmount(): void {
      if (highlightApiAvailable() && CSS.highlights.has(name)) {
        CSS.highlights.delete(name);
      }
      highlight = null;
      if (styleEl) {
        ruleText = "";
        rewriteOwnRule();
        // Drop the node entirely once the sheet is empty, so we leave no trace.
        if (!styleEl.textContent || styleEl.textContent.trim() === "") {
          styleEl.remove();
        }
        styleEl = null;
      }
    },
  };
}
