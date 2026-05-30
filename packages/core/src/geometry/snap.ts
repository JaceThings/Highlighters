import type { SnapMode } from "../types.js";

/**
 * Snap a range's start/end to the nearest text boundary (blueprint R22b — the
 * digital analog of the Uni Propus "window tip", which exists to stop a stroke
 * precisely at line ends with no overshoot into surrounding whitespace).
 *
 * This is the only geometry module that reads the DOM, and it performs **reads
 * only** — it returns a cloned, adjusted `Range` and never mutates the document
 * or the input range. It is import-safe in a non-DOM environment (the functions
 * simply return the range unchanged when there is nothing to measure).
 *
 *  - `none`  — returns the range unchanged.
 *  - `word`  — trims leading/trailing whitespace, then expands each end outward
 *    to the enclosing word boundary so a mid-word selection covers the whole word.
 *  - `glyph` — trims leading/trailing whitespace only (clamp to the exact glyphs,
 *    never expanding past them).
 *  - `line`  — trims surrounding whitespace like `word`/`glyph`; the per-visual-
 *    line clamping that "line" implies is enforced downstream when rects are
 *    measured, so here it behaves as a whitespace trim that keeps the painted
 *    span flush with the text.
 *
 * Returns the same reference for `none` (cheap, no allocation); every other mode
 * returns a clone so the caller's range is untouched.
 */

/** Characters treated as trimmable whitespace at a range boundary. */
const WHITESPACE = /\s/;
/** Characters that constitute a "word" for `word`-mode expansion. */
const WORD_CHAR = /[\p{L}\p{N}_-]/u;

/** True when the value is a DOM `Text` node we can read a `data` string from. */
function isText(node: Node | null): node is Text {
  return node != null && node.nodeType === 3 /* TEXT_NODE */;
}

/**
 * Snap `range` to `mode`. Read-only; returns a (possibly cloned) range.
 *
 * @param range - The source range. Never mutated.
 * @param mode - The boundary-snapping mode.
 * @returns The original range for `none`, otherwise an adjusted clone.
 */
export function snapRangeToBounds(range: Range, mode: SnapMode): Range {
  if (mode === "none") return range;

  // Guard against a non-DOM / detached environment: if the range can't be
  // cloned, hand it back untouched rather than throwing.
  if (typeof range.cloneRange !== "function") return range;

  const out = range.cloneRange();

  // --- Trim leading whitespace at the start boundary ------------------------
  if (isText(out.startContainer)) {
    const text = out.startContainer.data;
    let i = out.startOffset;
    while (i < text.length && WHITESPACE.test(text.charAt(i))) i++;
    if (i !== out.startOffset) out.setStart(out.startContainer, i);
  }

  // --- Trim trailing whitespace at the end boundary -------------------------
  if (isText(out.endContainer)) {
    const text = out.endContainer.data;
    let j = out.endOffset;
    while (j > 0 && WHITESPACE.test(text.charAt(j - 1))) j--;
    if (j !== out.endOffset) out.setEnd(out.endContainer, j);
  }

  // `word` additionally grows each end outward to the enclosing word boundary,
  // so a selection that starts/ends mid-word covers the whole word (the window
  // tip's "don't clip a word in half" behavior). `line`/`glyph` stop at the
  // trimmed glyph bounds.
  if (mode === "word") {
    if (isText(out.startContainer)) {
      const text = out.startContainer.data;
      let i = out.startOffset;
      while (i > 0 && WORD_CHAR.test(text.charAt(i - 1))) i--;
      if (i !== out.startOffset) out.setStart(out.startContainer, i);
    }
    if (isText(out.endContainer)) {
      const text = out.endContainer.data;
      let j = out.endOffset;
      while (j < text.length && WORD_CHAR.test(text.charAt(j))) j++;
      if (j !== out.endOffset) out.setEnd(out.endContainer, j);
    }
  }

  // A trim that crosses the two boundaries (e.g. an all-whitespace range)
  // can leave start after end; collapse defensively to the start so callers
  // get a valid, paint-nothing range rather than an inverted one.
  if (out.collapsed && !range.collapsed) {
    out.collapse(true);
  }

  return out;
}
