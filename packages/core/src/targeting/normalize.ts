/**
 * The single normalization front door (A2): every {@link Target} variant —
 * `Element`, CSS selector, `Range`, `Selection`, {@link TextTarget},
 * {@link PageTarget} — collapses to a flat array of DOM `Range`s here, so the
 * rest of the pipeline (`rangesToLineRects` → geometry → renderer) only ever
 * deals with ranges. Text-query targets defer to `findTextRanges`; page targets
 * defer to `collectPageRanges`.
 *
 * `toRanges` never throws: an unmatched selector, an empty page, a collapsed
 * selection, or being called without a DOM all yield `[]`.
 */

import type { PageTarget, Target, TextTarget } from "../types.js";
import { findTextRanges } from "./text-search.js";
import { collectPageRanges } from "./include-exclude.js";
import { hasDomWithRange } from "../internal/dom.js";

/** Whether `value` is a DOM `Range` (avoids `instanceof` across realms/SSR). */
function isRange(value: unknown): value is Range {
  return typeof Range !== "undefined" && value instanceof Range;
}

/** Whether `value` is a `Selection` — structural check, SSR-safe. */
function isSelection(value: unknown): value is Selection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Selection).getRangeAt === "function" &&
    typeof (value as Selection).rangeCount === "number"
  );
}

/** Whether `value` is an `Element`. */
function isElement(value: unknown): value is Element {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    typeof (value as Element).querySelectorAll === "function"
  );
}

/** Whether `value` is a {@link TextTarget} (has a `text` string/RegExp). */
function isTextTarget(value: unknown): value is TextTarget {
  if (typeof value !== "object" || value === null) return false;
  const text = (value as TextTarget).text;
  return typeof text === "string" || text instanceof RegExp;
}

/** Whether `value` is a {@link PageTarget} (a plain object that isn't a text target). */
function isPageTarget(value: unknown): value is PageTarget {
  // A PageTarget is the catch-all object form: it may carry root/include/exclude
  // (all optional). It is only reached after Range/Selection/TextTarget have
  // been ruled out, so any remaining plain object is treated as a page target.
  return typeof value === "object" && value !== null;
}

/**
 * Build a `Range` spanning an element's entire content (R6a). Whitespace is left
 * intact here; boundary trimming/snapping is the snap stage's job.
 */
function rangeForElement(el: Element): Range {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range;
}

/**
 * Normalize any {@link Target} to a flat array of DOM `Range`s (A2).
 *
 * Dispatch order is significant: the more specific structural shapes
 * (`Range`, `Selection`, `Element`, {@link TextTarget}) are matched before the
 * catch-all {@link PageTarget} object form, and `string` is treated as a CSS
 * selector resolved to elements.
 *
 * Returns `[]` (never throws) when nothing matches or when called without a DOM.
 */
export function toRanges(target: Target): Range[] {
  if (!hasDomWithRange() || target == null) return [];

  // Range — used directly (R6b).
  if (isRange(target)) {
    return target.collapsed ? [] : [target];
  }

  // Selection — its non-collapsed ranges (R6b).
  if (isSelection(target)) {
    const out: Range[] = [];
    for (let i = 0; i < target.rangeCount; i++) {
      const range = target.getRangeAt(i);
      if (!range.collapsed) out.push(range);
    }
    return out;
  }

  // Element — a range over its content (R6a).
  if (isElement(target)) {
    return [rangeForElement(target)];
  }

  // CSS selector string — every matching element's content (R6a).
  if (typeof target === "string") {
    if (target.length === 0) return [];
    let elements: NodeListOf<Element>;
    try {
      elements = document.querySelectorAll(target);
    } catch {
      // Invalid selector matches nothing rather than throwing.
      return [];
    }
    const out: Range[] = [];
    elements.forEach((el) => out.push(rangeForElement(el)));
    return out;
  }

  // Text query — every match under the root (R6c).
  if (isTextTarget(target)) {
    const root = target.root ?? document.body;
    if (!root) return [];
    return findTextRanges(root, target.text);
  }

  // Page target — whole subtree with include/exclude (R6d/R7).
  if (isPageTarget(target)) {
    return collectPageRanges(target);
  }

  return [];
}
