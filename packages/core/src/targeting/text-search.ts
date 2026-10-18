import {
  FILTER_ACCEPT,
  FILTER_REJECT,
  SHOW_TEXT,
  hasDomWithRange,
  isInNonRenderedSubtree,
  nextTextNode,
} from "../internal/dom.js";

interface CollectedText {
  text: string;
  nodes: Text[];
  starts: number[];
}

function collectText(root: Node): CollectedText {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";

  const walker = document.createTreeWalker(root, SHOW_TEXT, {
    acceptNode: (n) => (isInNonRenderedSubtree(n) ? FILTER_REJECT : FILTER_ACCEPT),
  });
  for (let node = nextTextNode(walker); node; node = nextTextNode(walker)) {
    nodes.push(node);
    starts.push(text.length);
    text += node.data;
  }
  return { text, nodes, starts };
}

function nodeAt(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function rangeForSpan({ nodes, starts }: CollectedText, start: number, end: number): Range {
  const range = document.createRange();
  const s = nodeAt(starts, start);
  const e = nodeAt(starts, end - 1);
  range.setStart(nodes[s], start - starts[s]);
  range.setEnd(nodes[e], end - starts[e]);
  return range;
}

export function findTextRanges(root: Element | Document, query: string | RegExp): Range[] {
  if (!hasDomWithRange() || !root) return [];

  const collected = collectText(root);
  const { text } = collected;
  if (text.length === 0) return [];

  const ranges: Range[] = [];

  if (!(query instanceof RegExp)) {
    if (query.length === 0) return [];
    for (let index = text.indexOf(query); index !== -1; index = text.indexOf(query, index + query.length)) {
      ranges.push(rangeForSpan(collected, index, index + query.length));
    }
    return ranges;
  }

  // Sticky `y` wins over `g`; drop it so the scan can walk the whole string.
  const base = query.flags.replace("y", "");
  const re = new RegExp(query.source, base.includes("g") ? base : base + "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const len = match[0].length;
    if (len === 0) {
      re.lastIndex += 1;
      continue;
    }
    ranges.push(rangeForSpan(collected, match.index, match.index + len));
  }
  return ranges;
}
