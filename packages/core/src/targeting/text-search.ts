/**
 * Text-query targeting: a `Range` per match of a string/`RegExp` under a root, including matches that
 * span inline element boundaries (e.g. `foo<em>bar</em>baz`). The walk concatenates text nodes into
 * one flat string, recording each character's source node + offset, then maps matches back onto the nodes.
 */

import {
  FILTER_ACCEPT,
  FILTER_REJECT,
  hasDomWithRange,
  isInNonRenderedSubtree,
  SHOW_TEXT,
} from "../internal/dom.js";

/** A single character's provenance: the owning text node and its in-node index. */
interface CharSlot {
  node: Text;
  offset: number;
}

/** Flat string of all text under `root`, plus a parallel index mapping each character to its source node + in-node offset. */
function collectText(root: Node): { text: string; slots: CharSlot[] } {
  const slots: CharSlot[] = [];
  let text = "";

  // Skip non-rendered subtrees so a query never matches CSS/JS source or straddles into adjacent visible text.
  const walker = document.createTreeWalker(root, SHOW_TEXT, {
    acceptNode: (n) => (isInNonRenderedSubtree(n) ? FILTER_REJECT : FILTER_ACCEPT),
  });
  let node = walker.nextNode() as Text | null;
  while (node) {
    const value = node.data;
    for (let i = 0; i < value.length; i++) {
      slots.push({ node, offset: i });
    }
    text += value;
    node = walker.nextNode() as Text | null;
  }

  return { text, slots };
}

/** Range covering the half-open span `[start, end)` of the flat text. */
function rangeForSpan(slots: CharSlot[], start: number, end: number): Range {
  const range = document.createRange();
  const startSlot = slots[start];
  const endSlot = slots[end - 1];
  range.setStart(startSlot.node, startSlot.offset);
  range.setEnd(endSlot.node, endSlot.offset + 1);
  return range;
}

/**
 * Find every match of `query` within `root`, one `Range` per match.
 * - `string`: literal, case-sensitive, non-overlapping.
 * - `RegExp`: scanned globally on a copy; case follows the `i` flag; zero-width matches skipped.
 * Never throws.
 */
export function findTextRanges(
  root: Element | Document,
  query: string | RegExp,
): Range[] {
  if (!hasDomWithRange() || !root) return [];

  const { text, slots } = collectText(root);
  if (text.length === 0) return [];

  const ranges: Range[] = [];

  if (typeof query === "string") {
    if (query.length === 0) return [];
    let from = 0;
    for (;;) {
      const index = text.indexOf(query, from);
      if (index === -1) break;
      ranges.push(rangeForSpan(slots, index, index + query.length));
      from = index + query.length; // advance past this match
    }
    return ranges;
  }

  // Strip the sticky `y` flag first: under `y`, `exec` only matches at `lastIndex`, so adding `g` can't
  // override it and the scan would stop at the first gap, silently under-matching.
  const base = query.flags.replace("y", "");
  const flags = base.includes("g") ? base : base + "g";
  const re = new RegExp(query.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const matched = match[0];
    if (matched.length === 0) {
      // Zero-width match: nudge lastIndex to avoid an infinite loop.
      re.lastIndex += 1;
      continue;
    }
    ranges.push(rangeForSpan(slots, match.index, match.index + matched.length));
  }

  return ranges;
}
