import type { PageTarget } from "../types.js";
import {
  FILTER_ACCEPT,
  FILTER_REJECT,
  SHOW_TEXT,
  hasDomWithRange,
  isInNonRenderedSubtree,
  nextTextNode,
} from "../internal/dom.js";

const EXCLUDE_SELECTOR = "[data-highlight-exclude]";

function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function matchesAny(el: Element, selectors: string[]): boolean {
  for (const selector of selectors) {
    try {
      if (selector && el.closest(selector)) return true;
    } catch {
    }
  }
  return false;
}

export function isExcluded(node: Node, excludeSelectors: string[]): boolean {
  const el = elementOf(node);
  return !!el && (!!el.closest(EXCLUDE_SELECTOR) || matchesAny(el, excludeSelectors));
}

export function excludeMarkedSubtrees(ranges: Range[]): Range[] {
  if (!hasDomWithRange()) return ranges;
  const out: Range[] = [];
  for (const range of ranges) {
    if (range.collapsed) continue;
    const root = elementOf(range.commonAncestorContainer);
    if (root?.closest(EXCLUDE_SELECTOR)) continue;
    const hits = root
      ? Array.from(root.querySelectorAll(EXCLUDE_SELECTOR)).filter(
          (el) => range.intersectsNode(el) && !el.parentElement?.closest(EXCLUDE_SELECTOR),
        )
      : [];
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

export function collectPageRanges(target: PageTarget): Range[] {
  if (!hasDomWithRange()) return [];

  const root = target.root ?? document.body;
  if (!root) return [];

  const include = target.include ?? [];
  const exclude = target.exclude ?? [];

  const walker = document.createTreeWalker(root, SHOW_TEXT, {
    acceptNode(node) {
      const text = node as Text;
      if (text.data.trim().length === 0 || isInNonRenderedSubtree(text)) return FILTER_REJECT;
      if (isExcluded(text, exclude)) return FILTER_REJECT;
      if (include.length > 0 && !matchesAny(text.parentElement!, include)) return FILTER_REJECT;
      return FILTER_ACCEPT;
    },
  });

  const ranges: Range[] = [];
  for (let node = nextTextNode(walker); node; node = nextTextNode(walker)) {
    const data = node.data;
    const start = data.length - data.trimStart().length;
    const end = data.trimEnd().length;
    if (end > start) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      ranges.push(range);
    }
  }
  return ranges;
}
