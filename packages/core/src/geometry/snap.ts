import type { SnapMode } from "../types.js";

/**
 * Snap a range's start/end to the nearest text boundary, so a stroke stops
 * precisely at line ends with no overshoot into surrounding whitespace.
 *
 * The only geometry module that reads the DOM, and it reads only - it returns a
 * cloned, adjusted `Range` and never mutates the document or the input. Import-safe
 * in a non-DOM environment (returns the range unchanged when nothing to measure).
 *
 *  - `none`  - returns the range unchanged.
 *  - `word`  - trims surrounding whitespace, then expands each end outward to the
 *    enclosing word boundary so a mid-word selection covers the whole word.
 *  - `glyph` - trims surrounding whitespace only.
 *  - `line`  - trims like `glyph`; the per-visual-line clamping is enforced
 *    downstream when rects are measured.
 *
 * Returns the same reference for `none`; every other mode returns a clone.
 */

const WHITESPACE = /\s/;
/** Characters that constitute a "word" for `word`-mode expansion. */
const WORD_CHAR = /[\p{L}\p{N}_-]/u;

function isText(node: Node | null): node is Text {
  return node != null && node.nodeType === 3 /* TEXT_NODE */;
}

/** Snap `range` to `mode`. Read-only; returns a (possibly cloned) range. */
export function snapRangeToBounds(range: Range, mode: SnapMode): Range {
  if (mode === "none") return range;

  // Non-DOM / detached environment: hand the range back rather than throwing.
  if (typeof range.cloneRange !== "function") return range;

  const out = range.cloneRange();

  if (isText(out.startContainer)) {
    const text = out.startContainer.data;
    let i = out.startOffset;
    while (i < text.length && WHITESPACE.test(text.charAt(i))) i++;
    if (i !== out.startOffset) out.setStart(out.startContainer, i);
  }

  if (isText(out.endContainer)) {
    const text = out.endContainer.data;
    let j = out.endOffset;
    while (j > 0 && WHITESPACE.test(text.charAt(j - 1))) j--;
    if (j !== out.endOffset) out.setEnd(out.endContainer, j);
  }

  // `word` grows each end outward to the enclosing word boundary; `line`/`glyph`
  // stop at the trimmed glyph bounds.
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

  // A trim that crosses the two boundaries (e.g. an all-whitespace range) can
  // leave start after end; collapse to the start so callers get a valid,
  // paint-nothing range rather than an inverted one.
  if (out.collapsed && !range.collapsed) {
    out.collapse(true);
  }

  return out;
}
