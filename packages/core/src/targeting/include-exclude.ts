/**
 * Whole-page targeting with include/exclude selectors. Exclusion always wins over
 * inclusion because it is resolved structurally at collection time: a text node is
 * dropped the moment any ancestor matches an exclude selector (or carries
 * `data-highlight-exclude`), regardless of which include selector other ancestors
 * match.
 */

import type { PageTarget } from "../types.js";
import {
  FILTER_ACCEPT,
  FILTER_REJECT,
  hasDomWithRange,
  isInNonRenderedSubtree,
  SHOW_TEXT,
} from "../internal/dom.js";

const EXCLUDE_ATTR = "data-highlight-exclude";

function elementOf(node: Node): Element | null {
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

/**
 * True if `node` is inside any subtree matching an exclude selector or marked with
 * `data-highlight-exclude`. Uses `Element.closest()` so an excluded subtree nested
 * inside an included ancestor is still excluded.
 */
export function isExcluded(node: Node, excludeSelectors: string[]): boolean {
  const el = elementOf(node);
  if (!el) return false;

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

/** With no include selectors the whole root is in scope (returns `true` for every node). */
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

/**
 * Collect every textual `Range` under `target.root` (default `document.body`),
 * honoring optional `include` selectors and dropping anything inside an excluded
 * subtree. Each accepted text node becomes one `Range` over its non-whitespace
 * span. Returns `[]` outside a DOM or when nothing matches; never throws.
 */
export function collectPageRanges(target: PageTarget): Range[] {
  if (!hasDomWithRange()) return [];

  const root = target.root ?? document.body;
  if (!root) return [];

  const include = target.include ?? [];
  const exclude = target.exclude ?? [];

  const walker = document.createTreeWalker(root, SHOW_TEXT, {
    acceptNode(node) {
      const text = node as Text;
      if (text.data.trim().length === 0) return FILTER_REJECT;
      // Never paint text that doesn't render (<script>/<style>/<head>/…).
      if (isInNonRenderedSubtree(text)) return FILTER_REJECT;
      if (isExcluded(text, exclude)) return FILTER_REJECT;
      if (!isIncluded(text, include)) return FILTER_REJECT;
      return FILTER_ACCEPT;
    },
  });

  const ranges: Range[] = [];
  let node = walker.nextNode() as Text | null;
  while (node) {
    const data = node.data;
    // Trim to the first/last non-whitespace char so the mark hugs visible glyphs.
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
