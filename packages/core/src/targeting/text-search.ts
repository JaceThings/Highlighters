/**
 * Text-query targeting (R6c): find every occurrence of a string or `RegExp`
 * under a root and return a `Range` per match — including matches that span
 * inline element boundaries (e.g. `foo<em>bar</em>baz`).
 *
 * The walk concatenates the root's text nodes into one logical string while
 * remembering, for every character offset, which `Text` node and in-node offset
 * it came from. Matches are found in the flat string, then each match's
 * `[start, end)` character span is mapped back onto the original nodes to build
 * a DOM `Range`. Because the flat string ignores element structure, a match that
 * crosses an inline boundary produces a single `Range` whose start and end live
 * in different text nodes.
 */

/** A single character's provenance: the owning text node and its in-node index. */
interface CharSlot {
  node: Text;
  offset: number;
}

const SHOW_TEXT = 0x4; // NodeFilter.SHOW_TEXT, defined without touching globals.

/**
 * Whether we are running with a usable DOM. The functions below read
 * `document`/`Range`, so guard at the entry points to stay SSR-safe (R34).
 */
function hasDom(): boolean {
  return typeof document !== "undefined" && typeof Range !== "undefined";
}

/**
 * Build a flat string of all text under `root`, plus a parallel index that maps
 * every character position to its source `Text` node and in-node offset. Whole
 * text nodes are appended verbatim, so adjacent nodes concatenate seamlessly and
 * a match can straddle the seam between them.
 */
function collectText(root: Node): { text: string; slots: CharSlot[] } {
  const slots: CharSlot[] = [];
  let text = "";

  const walker = document.createTreeWalker(root, SHOW_TEXT);
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
 * Create a `Range` covering the half-open character span `[start, end)` of the
 * flat text, using the slot index to resolve start/end into concrete nodes.
 * `end` maps to the *end* of the slot at `end - 1` so the range is inclusive of
 * the final matched character.
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
 * Find every match of `query` within `root` and return one `Range` per match.
 *
 * - A `string` query is matched literally and case-sensitively; every
 *   non-overlapping occurrence yields a range.
 * - A `RegExp` query is matched with its own flags honored. A non-global pattern
 *   is treated as global for the scan (so every occurrence is found) without
 *   mutating the caller's `RegExp`; case sensitivity follows the pattern's `i`
 *   flag. Zero-width matches are skipped (they produce no paintable range and
 *   would otherwise loop forever).
 *
 * Returns `[]` when there is no DOM, when `root` has no text, or when nothing
 * matches. Never throws.
 */
export function findTextRanges(
  root: Element | Document,
  query: string | RegExp,
): Range[] {
  if (!hasDom() || !root) return [];

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

  // RegExp: always scan globally, but leave the caller's pattern untouched.
  const flags = query.flags.includes("g") ? query.flags : query.flags + "g";
  const re = new RegExp(query.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const matched = match[0];
    if (matched.length === 0) {
      // Zero-width match: nothing to paint; nudge lastIndex to avoid an
      // infinite loop on a pattern like /(?:)/g.
      re.lastIndex += 1;
      continue;
    }
    ranges.push(rangeForSpan(slots, match.index, match.index + matched.length));
  }

  return ranges;
}
