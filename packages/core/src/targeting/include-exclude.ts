/**
 * Whole-page-then-negate targeting (R6d) and the exclusion-precedence primitive
 * (R7). Everything textual under a root is collected into `Range`s, except text
 * inside an excluded subtree — and exclusion always wins over inclusion, because
 * it is resolved *structurally* at collection time (A2): a text node is dropped
 * the moment any ancestor matches an exclude selector (or carries
 * `data-highlight-exclude`), regardless of which include selector its other
 * ancestors match.
 */

import type { PageTarget } from "../types.js";

const SHOW_TEXT = 0x4; // NodeFilter.SHOW_TEXT, without touching globals at load.
const FILTER_ACCEPT = 1; // NodeFilter.FILTER_ACCEPT
const FILTER_REJECT = 2; // NodeFilter.FILTER_REJECT

/** Declarative opt-out attribute: any element carrying it (or under one) is excluded. */
const EXCLUDE_ATTR = "data-highlight-exclude";

function hasDom(): boolean {
  return typeof document !== "undefined" && typeof Range !== "undefined";
}

/** Resolve the `Element` a node lives in: the node itself, or its parent element. */
function elementOf(node: Node): Element | null {
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

/**
 * True if `node` is inside any subtree matching an exclude selector, or inside a
 * subtree marked with `data-highlight-exclude`. This is the precedence primitive
 * (R7): an excluded subtree nested inside an included ancestor is still excluded.
 *
 * Uses `Element.closest()` so the check is ancestor-aware — matching the *node's
 * own* element or any ancestor up to the document root.
 */
export function isExcluded(node: Node, excludeSelectors: string[]): boolean {
  const el = elementOf(node);
  if (!el) return false;

  // Declarative attribute exclusion (R6e): cheapest check first.
  if (el.closest(`[${EXCLUDE_ATTR}]`)) return true;

  for (const selector of excludeSelectors) {
    if (!selector) continue;
    try {
      if (el.closest(selector)) return true;
    } catch {
      // An invalid selector excludes nothing rather than throwing.
    }
  }
  return false;
}

/**
 * True if `node` falls under at least one include selector. With no include
 * selectors the whole root is in scope, so this returns `true` for every node.
 */
function isIncluded(node: Node, includeSelectors: string[]): boolean {
  if (includeSelectors.length === 0) return true;
  const el = elementOf(node);
  if (!el) return false;
  for (const selector of includeSelectors) {
    if (!selector) continue;
    try {
      if (el.closest(selector)) return true;
    } catch {
      // Ignore invalid include selectors.
    }
  }
  return false;
}

/** Whether a text node carries any non-whitespace content worth highlighting. */
function hasVisibleText(node: Text): boolean {
  return node.data.trim().length > 0;
}

/**
 * Collect every textual `Range` under `target.root` (default `document.body`),
 * honoring optional `include` selectors and dropping anything inside an excluded
 * subtree. Exclusion takes precedence over inclusion at every level (R7): the
 * `TreeWalker` rejects an excluded element's *entire subtree* up front, so no
 * descendant text — however deeply included — can leak through.
 *
 * Each accepted text node becomes one `Range` over its non-whitespace span
 * (leading/trailing whitespace trimmed so a band never overshoots into the gaps
 * between inline elements). Returns `[]` outside a DOM or when nothing matches;
 * never throws.
 */
export function collectPageRanges(target: PageTarget): Range[] {
  if (!hasDom()) return [];

  const root = target.root ?? document.body;
  if (!root) return [];

  const include = target.include ?? [];
  const exclude = target.exclude ?? [];

  const walker = document.createTreeWalker(root, SHOW_TEXT, {
    acceptNode(node) {
      const text = node as Text;
      if (!hasVisibleText(text)) return FILTER_REJECT;
      // Structural exclusion precedence (R7): drop the whole excluded subtree.
      if (isExcluded(text, exclude)) return FILTER_REJECT;
      if (!isIncluded(text, include)) return FILTER_REJECT;
      return FILTER_ACCEPT;
    },
  });

  const ranges: Range[] = [];
  let node = walker.nextNode() as Text | null;
  while (node) {
    const data = node.data;
    // Trim the range to the first/last non-whitespace character so the mark
    // hugs the visible glyphs rather than the surrounding whitespace.
    const start = data.length - data.replace(/^\s+/, "").length;
    const end = data.replace(/\s+$/, "").length;
    if (end > start) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      ranges.push(range);
    }
    node = walker.nextNode() as Text | null;
  }

  return ranges;
}
