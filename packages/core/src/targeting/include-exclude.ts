import type { PageTarget } from "../types.js";
import {
  FILTER_ACCEPT,
  FILTER_REJECT,
  SHOW_TEXT,
  hasDomWithRange,
  isInNonRenderedSubtree,
  isTextNode,
  nextTextNode,
} from "../internal/dom.js";

const EXCLUDE_ATTR = "data-highlight-exclude";

function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

export function isExcluded(node: Node, excludeSelectors: string[]): boolean {
  const el = elementOf(node);
  if (!el) return false;

  if (el.closest(`[${EXCLUDE_ATTR}]`)) return true;

  for (const selector of excludeSelectors) {
    if (!selector) continue;
    try {
      if (el.closest(selector)) return true;
    } catch {
    }
  }
  return false;
}

export function excludeMarkedSubtrees(ranges: Range[]): Range[] {
  if (!hasDomWithRange()) return ranges;
  const out: Range[] = [];
  for (const range of ranges) {
    if (range.collapsed) continue;
    const root = elementOf(range.commonAncestorContainer);
    if (root?.closest(`[${EXCLUDE_ATTR}]`)) continue;
    const all = root ? Array.from(root.querySelectorAll(`[${EXCLUDE_ATTR}]`)) : [];
    const hits = all.filter(
      (el) => range.intersectsNode(el) && !el.parentElement?.closest(`[${EXCLUDE_ATTR}]`),
    );
    if (hits.length === 0) {
      out.push(range);
      continue;
    }
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

function isIncluded(node: Node, includeSelectors: string[]): boolean {
  if (includeSelectors.length === 0) return true;
  const el = elementOf(node);
  if (!el) return false;
  for (const selector of includeSelectors) {
    if (!selector) continue;
    try {
      if (el.closest(selector)) return true;
    } catch {
    }
  }
  return false;
}

export function collectPageRanges(target: PageTarget): Range[] {
  if (!hasDomWithRange()) return [];

  const root = target.root ?? document.body;
  if (!root) return [];

  const include = target.include ?? [];
  const exclude = target.exclude ?? [];

  const walker = document.createTreeWalker(root, SHOW_TEXT, {
    acceptNode(node) {
      if (!isTextNode(node)) return FILTER_REJECT;
      const text = node;
      if (text.data.trim().length === 0) return FILTER_REJECT;
      if (isInNonRenderedSubtree(text)) return FILTER_REJECT;
      if (isExcluded(text, exclude)) return FILTER_REJECT;
      if (!isIncluded(text, include)) return FILTER_REJECT;
      return FILTER_ACCEPT;
    },
  });

  const ranges: Range[] = [];
  let node = nextTextNode(walker);
  while (node) {
    const data = node.data;
    const start = data.length - data.replace(/^\s+/, "").length;
    const end = data.replace(/\s+$/, "").length;
    if (end > start) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      ranges.push(range);
    }
    node = nextTextNode(walker);
  }

  return ranges;
}
