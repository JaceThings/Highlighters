import type { Target, TextTarget } from "../types.js";
import { findTextRanges } from "./text-search.js";
import { collectPageRanges } from "./include-exclude.js";
import { hasDomWithRange, hasGlobal } from "../internal/dom.js";

function isRange(value: Target): value is Range {
  return hasGlobal("Range") && value instanceof Range;
}

function isSelection(value: Target): value is Selection {
  return value instanceof Object && "getRangeAt" in value && "rangeCount" in value;
}

function isElement(value: Target): value is Element {
  return (
    value instanceof Object &&
    "nodeType" in value &&
    value.nodeType === 1 &&
    "querySelectorAll" in value
  );
}

function isTextTarget(value: Target): value is TextTarget {
  return value instanceof Object && "text" in value;
}

function rangeForElement(el: Element): Range {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range;
}

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

  if (isTextTarget(target)) {
    const root = target.root ?? document.body;
    if (!root) return [];
    return findTextRanges(root, target.text);
  }

  if (target instanceof Object) {
    return collectPageRanges(target);
  }

  if (target.length === 0) return [];
  let elements: NodeListOf<Element>;
  try {
    elements = document.querySelectorAll(target);
  } catch {
    return [];
  }
  const out: Range[] = [];
  elements.forEach((el) => out.push(rangeForElement(el)));
  return out;
}
