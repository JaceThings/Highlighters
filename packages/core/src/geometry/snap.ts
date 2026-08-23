import type { SnapMode } from "../types.js";

const WHITESPACE = /\s/;
const WORD_CHAR = /[\p{L}\p{N}_-]/u;

function isText(node: Node | null): node is Text {
  return node != null && node.nodeType === 3;
}

export function snapRangeToBounds(range: Range, mode: SnapMode): Range {
  if (mode === "none") return range;
  if (!("cloneRange" in range)) return range;

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

  // Trimming an all-whitespace range can invert start/end.
  if (out.collapsed && !range.collapsed) {
    out.collapse(true);
  }

  return out;
}
