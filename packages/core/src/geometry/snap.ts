import type { SnapMode } from "../types.js";
import { isTextNode } from "../internal/dom.js";

const WHITESPACE = /\s/;
const WORD_CHAR = /[\p{L}\p{N}_-]/u;

export function snapRangeToBounds(range: Range, mode: SnapMode): Range {
  if (mode === "none") return range;

  const out = range.cloneRange();
  const { startContainer, endContainer } = out;

  if (isTextNode(startContainer)) {
    const text = startContainer.data;
    let i = out.startOffset;
    while (i < text.length && WHITESPACE.test(text.charAt(i))) i++;
    if (mode === "word") while (i > 0 && WORD_CHAR.test(text.charAt(i - 1))) i--;
    if (i !== out.startOffset) out.setStart(startContainer, i);
  }

  if (isTextNode(endContainer)) {
    const text = endContainer.data;
    let j = out.endOffset;
    while (j > 0 && WHITESPACE.test(text.charAt(j - 1))) j--;
    if (mode === "word") while (j < text.length && WORD_CHAR.test(text.charAt(j))) j++;
    if (j !== out.endOffset) out.setEnd(endContainer, j);
  }

  // Trimming an all-whitespace range can invert start/end.
  if (out.collapsed && !range.collapsed) out.collapse(true);

  return out;
}
