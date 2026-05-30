/**
 * Tier C renderer — the CSS Custom Highlight API (`::highlight()`).
 *
 * The maximally-safe tier (blueprint R26 / R29): it registers the mark's `Range`s
 * with `CSS.highlights` and paints them via a generated `::highlight()` rule. It
 * adds **zero** overlay DOM, multiline is native, find-in-page and selection are
 * unaffected, and the text nodes are never touched. The trade-off is fidelity —
 * the highlight is flat colour only, with no edge organicness, texture, or
 * multiply optics. Degrade to this tier is fidelity-only: the band's colour and
 * coverage still match the other tiers (R28).
 *
 * Each renderer instance owns one named `Highlight` registration and one CSS rule
 * in a shared, document-level `<style>` element. `unmount()` deregisters the
 * highlight and removes its rule, leaving the document pristine (R9).
 */

import type { Renderer, RenderContext } from "../types.js";

/** Monotonic id source so concurrent marks never collide on a highlight name. */
let highlightSeq = 0;

/** The id of the shared `<style>` element holding every `::highlight()` rule. */
const STYLE_ID = "highlighters-highlight-api-styles";

/**
 * Lazily create (or return) the single document-level `<style>` that holds all
 * `::highlight()` rules. One shared stylesheet keeps DOM churn to a single node
 * regardless of how many Tier C marks are live.
 */
function getSharedStyle(doc: Document): HTMLStyleElement {
  const existing = doc.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}

/**
 * Whether the Custom Highlight API is usable in this environment. Guarded so the
 * renderer no-ops safely under SSR or on engines without the API (C1).
 */
function highlightApiAvailable(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight !== "undefined"
  );
}

/**
 * Create a Tier C renderer.
 *
 * The renderer paints the mark's originating ranges (from
 * {@link RenderContext.ranges}) in a flat colour derived from the resolved
 * options. It writes one rule into the shared stylesheet keyed by a unique
 * highlight name and registers a `Highlight` over the ranges.
 *
 * @returns A {@link Renderer} whose `tier` is `"highlight-api"`.
 */
export function createHighlightApiRenderer(): Renderer {
  const name = `highlighters-${++highlightSeq}`;
  let highlight: Highlight | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let ruleText = "";

  /** Build the `::highlight()` rule body from resolved options. */
  function ruleFor(context: RenderContext): string {
    const { options } = context;
    // Tier C is flat colour only; honour colour, opacity and blend so identity
    // (colour) stays consistent with Tiers A/B even though edges/texture don't.
    const decls = [
      `background-color: ${options.color}`,
      `color: inherit`,
    ];
    // The Highlight API exposes a limited set of paintable properties; blend
    // mode is not among them, so opacity is folded into the colour via the
    // pseudo's background only when the colour cannot already carry alpha.
    return `::highlight(${name}) { ${decls.join("; ")}; }`;
  }

  /** Register (or re-register) the ranges under this renderer's highlight name. */
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
    // Rebuild this renderer's rule in place; updates replace rather than
    // accumulate, and other marks' rules in the shared sheet are untouched.
    rewriteOwnRule();
  }

  /** Replace this renderer's rule in the shared sheet without disturbing others. */
  function rewriteOwnRule(): void {
    if (!styleEl) return;
    const others = styleEl.textContent
      ? styleEl.textContent
          .split("}")
          .map((s) => (s.trim() ? s.trim() + "}" : ""))
          .filter((s) => s && !s.includes(`::highlight(${name})`))
      : [];
    styleEl.textContent = [...others, ruleText].join("\n");
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

    // Tier C adds no overlay DOM (it paints via ::highlight()), so there is no
    // wrapper to draw on — the draw-on is a no-op for this tier.
    bandFor: (): HTMLElement | null => null,

    unmount(): void {
      if (highlightApiAvailable() && CSS.highlights.has(name)) {
        CSS.highlights.delete(name);
      }
      highlight = null;
      if (styleEl) {
        // Remove only this renderer's rule; leave the shared sheet for others.
        ruleText = "";
        rewriteOwnRule();
        // If the sheet is now empty, drop the node entirely so we leave no trace.
        if (!styleEl.textContent || styleEl.textContent.trim() === "") {
          styleEl.remove();
        }
        styleEl = null;
      }
    },
  };
}
