/**
 * Text-query targeting: find every occurrence of a string or `RegExp` under a root
 * and return a `Range` per match — including matches that span inline element
 * boundaries (e.g. `foo<em>bar</em>baz`).
 *
 * The walk concatenates the root's text nodes into one flat string while recording,
 * per character offset, the source `Text` node and in-node offset. Matches found in
 * the flat string are mapped back onto the original nodes; a match crossing an inline
 * boundary yields one `Range` whose start and end live in different text nodes.
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

/**
 * Flat string of all text under `root`, plus a parallel index mapping every
 * character position to its source `Text` node and in-node offset.
 */
function collectText(root: Node): { text: string; slots: CharSlot[] } {
  const slots: CharSlot[] = [];
  let text = "";

  // Skip non-rendered subtrees (<script>/<style>/<head>/…) so a query never
  // matches CSS/JS source and a match can't straddle into adjacent visible text.
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

/**
 * Range covering the half-open span `[start, end)` of the flat text. `end` maps to
 * the end of the slot at `end - 1` so the range includes the final matched char.
 */
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
 *
 * - `string`: matched literally and case-sensitively; every non-overlapping
 *   occurrence yields a range.
 * - `RegExp`: scanned globally without mutating the caller's pattern; case
 *   sensitivity follows the `i` flag. Zero-width matches are skipped.
 *
 * Returns `[]` with no DOM, no text, or no match. Never throws.
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
      // Advance past this match so occurrences never overlap.
      from = index + query.length;
    }
    return ranges;
  }

  // Scan globally on a copy. Strip the sticky `y` flag first: with `y`, `exec`
  // only matches at `lastIndex` (anchored), so adding `g` can't override it and
  // the scan would stop at the first gap, silently under-matching.
  const base = query.flags.replace("y", "");
  const flags = base.includes("g") ? base : base + "g";
  const re = new RegExp(query.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const matched = match[0];
    if (matched.length === 0) {
      // Zero-width match: nudge lastIndex to avoid an infinite loop on /(?:)/g.
      re.lastIndex += 1;
      continue;
    }
    ranges.push(rangeForSpan(slots, match.index, match.index + matched.length));
  }

  return ranges;
}
