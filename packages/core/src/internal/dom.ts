/**
 * Internal SSR-environment predicates and `NodeFilter` sentinels (R34).
 *
 * These are the single source of truth for the "do we have a usable DOM?"
 * checks scattered across the targeting and render layers. Each predicate
 * preserves a *distinct* capability question — they are intentionally NOT
 * collapsed into one, because each call site reads a different set of globals
 * and a wider check would either over- or under-guard that site.
 *
 * This module is internal: it is never re-exported from the public barrels.
 * Every export is a literal or a plain function that touches no DOM global at
 * module load, so importing it is always SSR-safe.
 */

/**
 * Whether `document` and the `Range` constructor are both present — the guard
 * for the targeting collectors that build `Range`s over text nodes
 * (text-search, include-exclude, normalize, line-rects).
 */
export function hasDomWithRange(): boolean {
  return typeof document !== "undefined" && typeof Range !== "undefined";
}

/**
 * Whether both `document` and `window` are present — the guard for the render
 * entry points, which read layout and attach overlays.
 */
export function hasDom(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

/**
 * Whether `window` is present — the guard for the observer layer, which wires
 * `window`-level listeners and `ResizeObserver`s.
 */
export function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/**
 * Whether a DOM with media-query support (`window.matchMedia`) is present — the
 * guard for tier selection, which reads motion/data/pointer preferences.
 */
export function hasMediaQueries(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  );
}

/**
 * `NodeFilter` sentinel values, defined as plain literals so the collectors can
 * configure a `TreeWalker` without touching the global `NodeFilter` object at
 * module load — an SSR consideration, since `NodeFilter` does not exist outside
 * a DOM and reading it eagerly would break server-side import.
 */
/** `NodeFilter.SHOW_TEXT` — visit text nodes only. */
export const SHOW_TEXT = 0x4;
/** `NodeFilter.FILTER_ACCEPT` — keep the node. */
export const FILTER_ACCEPT = 1;
/** `NodeFilter.FILTER_REJECT` — drop the node and its subtree. */
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

/**
 * Whether `node` sits inside a subtree whose text is never rendered as page
 * content (`<script>`/`<style>`/`<template>`/`<noscript>`/`<head>`/`<title>`).
 * The text-collecting `TreeWalker`s reject such nodes so a query never matches
 * CSS/JS source or document metadata — and, because the check walks ancestors,
 * so a match can't straddle from non-rendered source into adjacent visible text.
 */
export function isInNonRenderedSubtree(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (NON_RENDERED_TAGS.has(el.tagName)) return true;
    el = el.parentElement;
  }
  return false;
}
