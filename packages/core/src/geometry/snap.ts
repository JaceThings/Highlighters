import type { SnapMode } from "../types.js";

/**
 * Snap a range's start/end to the nearest text boundary. Read-only DOM access: returns a
 * cloned, adjusted `Range`, never mutating the document or input, and import-safe off-DOM.
 *
 *  - `none`  - range unchanged (same reference).
 *  - `word`  - trims whitespace, then expands each end to the enclosing word boundary.
 *  - `glyph` - trims surrounding whitespace only.
 *  - `line`  - trims like `glyph`; per-visual-line clamping happens downstream.
 */

const WHITESPACE = /\s/;
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

  // `word` grows each end out to the enclosing word boundary.
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

  // A trim crossing both boundaries (e.g. an all-whitespace range) can invert start/end; collapse to a valid paint-nothing range.
  if (out.collapsed && !range.collapsed) {
    out.collapse(true);
  }

  return out;
}
