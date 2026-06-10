/** Whole-page targeting with include/exclude selectors. Exclusion always wins: a node is dropped the moment any ancestor matches an exclude selector. */

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

/** True if `node` is inside any subtree matching an exclude selector or marked `data-highlight-exclude`. */
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

/**
 * Reshape live-selection ranges so every `[data-highlight-exclude]` subtree is carved out, while the
 * runs between excluded elements stay whole (so their geometry is unchanged). The selection marker
 * paints by range rectangles, which span `user-select: none` text too, so a select-all would
 * otherwise band over opted-out regions. This only reshapes what gets painted; the document's own
 * selection is left alone, so single-range browsers keep working.
 */
export function excludeMarkedSubtrees(ranges: Range[]): Range[] {
  if (!hasDomWithRange()) return ranges;
  const out: Range[] = [];
  for (const range of ranges) {
    if (range.collapsed) continue;
    const root = elementOf(range.commonAncestorContainer);
    // The whole range sits inside an opted-out subtree: paint none of it.
    if (root?.closest(`[${EXCLUDE_ATTR}]`)) continue;
    // The opted-out elements this range crosses, outermost-only, in document order.
    const all = root ? Array.from(root.querySelectorAll(`[${EXCLUDE_ATTR}]`)) : [];
    const hits = all.filter(
      (el) => range.intersectsNode(el) && !all.some((o) => o !== el && o.contains(el)),
    );
    if (hits.length === 0) {
      out.push(range); // nothing opted out here: keep the range whole
      continue;
    }
    // Keep each gap (before, between, after the excluded elements) as one contiguous range.
    const cursor = range.cloneRange();
    for (const el of hits) {
      const gap = cursor.cloneRange();
      gap.setEndBefore(el);
      if (!gap.collapsed) out.push(gap);
      cursor.setStartAfter(el);
    }
    if (!cursor.collapsed) out.push(cursor);
  }
  return out;
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

/** Collect every textual `Range` under `target.root` (default `document.body`), honouring include/exclude. Each accepted text node becomes one `Range` over its non-whitespace span. Never throws. */
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
