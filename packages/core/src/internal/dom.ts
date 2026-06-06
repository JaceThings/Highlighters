/**
 * Internal SSR-environment predicates and `NodeFilter` sentinels.
 *
 * Each predicate is a distinct capability question, kept separate because each call
 * site reads a different set of globals. Touches no DOM global at module load (SSR-safe).
 */

/** `document` + `Range` present - guards the targeting collectors that build `Range`s. */
export function hasDomWithRange(): boolean {
  return typeof document !== "undefined" && typeof Range !== "undefined";
}

/** `document` + `window` present - guards the render entry points. */
export function hasDom(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

/** `window` present - guards the observer layer. */
export function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** `window.matchMedia` present - guards tier selection's preference reads. */
export function hasMediaQueries(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  );
}

// NodeFilter sentinels as literals: the global NodeFilter doesn't exist outside a DOM.
export const SHOW_TEXT = 0x4;
export const FILTER_ACCEPT = 1;
export const FILTER_REJECT = 2;

/** Tag names whose text content never renders as visible page content. */
const NON_RENDERED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "NOSCRIPT",
  "HEAD",
  "TITLE",
]);

/** Whether `node` sits inside a non-rendered subtree (walks ancestors). */
export function isInNonRenderedSubtree(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (NON_RENDERED_TAGS.has(el.tagName)) return true;
    el = el.parentElement;
  }
  return false;
}
