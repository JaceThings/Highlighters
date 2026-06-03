/**
 * The single normalization front door: every {@link Target} variant collapses to
 * a flat array of DOM `Range`s here, so the rest of the pipeline only ever deals
 * with ranges. Never throws - an unmatched selector, empty page, collapsed
 * selection, or no DOM all yield `[]`.
 */

import type { Target, TextTarget } from "../types.js";
import { findTextRanges } from "./text-search.js";
import { collectPageRanges } from "./include-exclude.js";
import { hasDomWithRange } from "../internal/dom.js";

/** Avoids `instanceof` across realms/SSR. */
function isRange(value: unknown): value is Range {
  return typeof Range !== "undefined" && value instanceof Range;
}

function isSelection(value: unknown): value is Selection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Selection).getRangeAt === "function" &&
    typeof (value as Selection).rangeCount === "number"
  );
}

function isElement(value: unknown): value is Element {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    typeof (value as Element).querySelectorAll === "function"
  );
}

function isTextTarget(value: unknown): value is TextTarget {
  if (typeof value !== "object" || value === null) return false;
  const text = (value as TextTarget).text;
  return typeof text === "string" || text instanceof RegExp;
}

/** Whitespace is left intact here; boundary trimming/snapping is the snap stage's job. */
function rangeForElement(el: Element): Range {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range;
}

/**
 * Normalize any {@link Target} to a flat array of DOM `Range`s. Dispatch order is
 * significant: the specific structural shapes (`Range`, `Selection`, `Element`,
 * {@link TextTarget}) are matched before the catch-all {@link PageTarget} object
 * form, and `string` is treated as a CSS selector. Never throws; returns `[]` when
 * nothing matches or without a DOM.
 */
export function toRanges(target: Target): Range[] {
  if (!hasDomWithRange() || target == null) return [];

  if (isRange(target)) {
    return target.collapsed ? [] : [target];
  }

  if (isSelection(target)) {
    const out: Range[] = [];
    for (let i = 0; i < target.rangeCount; i++) {
      const range = target.getRangeAt(i);
      if (!range.collapsed) out.push(range);
    }
    return out;
  }

  if (isElement(target)) {
    return [rangeForElement(target)];
  }

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

  if (isTextTarget(target)) {
    const root = target.root ?? document.body;
    if (!root) return [];
    return findTextRanges(root, target.text);
  }

  // Catch-all page-target object form: reached only after every more-specific
  // shape and null have returned.
  return collectPageRanges(target);
}
