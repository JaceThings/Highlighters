import {
  FILTER_ACCEPT,
  FILTER_REJECT,
  SHOW_TEXT,
  hasDomWithRange,
  isInNonRenderedSubtree,
  nextTextNode,
} from "../internal/dom.js";

interface CharSlot {
  node: Text;
  offset: number;
}

interface CollectedText {
  text: string;
  slots: CharSlot[];
}

function collectText(root: Node): CollectedText {
  const slots: CharSlot[] = [];
  let text = "";

  const walker = document.createTreeWalker(root, SHOW_TEXT, {
    acceptNode: (n) => (isInNonRenderedSubtree(n) ? FILTER_REJECT : FILTER_ACCEPT),
  });
  let node = nextTextNode(walker);
  while (node) {
    const value = node.data;
    for (let i = 0; i < value.length; i++) {
      slots.push({ node, offset: i });
    }
    text += value;
    node = nextTextNode(walker);
  }

  return { text, slots };
}

function rangeForSpan(slots: CharSlot[], start: number, end: number): Range {
  const range = document.createRange();
  const startSlot = slots[start];
  const endSlot = slots[end - 1];
  range.setStart(startSlot.node, startSlot.offset);
  range.setEnd(endSlot.node, endSlot.offset + 1);
  return range;
}

export function findTextRanges(
  root: Element | Document,
  query: string | RegExp,
): Range[] {
  if (!hasDomWithRange() || !root) return [];

  const { text, slots } = collectText(root);
  if (text.length === 0) return [];

  const ranges: Range[] = [];

  if (!(query instanceof RegExp)) {
    if (query.length === 0) return [];
    let from = 0;
    for (;;) {
      const index = text.indexOf(query, from);
      if (index === -1) break;
      ranges.push(rangeForSpan(slots, index, index + query.length));
      from = index + query.length;
    }
    return ranges;
  }

  // Sticky `y` wins over `g`; drop it so the scan can walk the whole string.
  const base = query.flags.replace("y", "");
  const flags = base.includes("g") ? base : base + "g";
  const re = new RegExp(query.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const matched = match[0];
    if (matched.length === 0) {
      re.lastIndex += 1;
      continue;
    }
    ranges.push(rangeForSpan(slots, match.index, match.index + matched.length));
  }

  return ranges;
}
