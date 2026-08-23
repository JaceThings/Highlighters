import type { Anchor, LineRect } from "../types.js";
import {
  FILTER_ACCEPT,
  FILTER_REJECT,
  SHOW_TEXT,
  hasDomWithRange,
  hasGlobal,
  isInNonRenderedSubtree,
} from "../internal/dom.js";

function pushRects(list: DOMRectList, out: DOMRect[]): void {
  for (let i = 0; i < list.length; i++) out.push(list[i]);
}

function rectArray(list: DOMRectList): DOMRect[] {
  const out: DOMRect[] = [];
  pushRects(list, out);
  return out;
}

function isHiddenText(node: Node): boolean {
  if (!hasGlobal("getComputedStyle")) return false;
  const parent = node.parentElement;
  if (!parent) return false;
  try {
    return getComputedStyle(parent).visibility === "hidden";
  } catch {
    return false;
  }
}

function collectRangeRects(range: Range, scope?: Element): DOMRect[] {
  const common = scope ?? range.commonAncestorContainer;
  if (!scope && common.nodeType === 3) {
    return rectArray(range.getClientRects());
  }
  if (!("createTreeWalker" in document)) {
    return rectArray(range.getClientRects());
  }

  const walker = document.createTreeWalker(common, SHOW_TEXT, {
    acceptNode(node: Node) {
      if (isInNonRenderedSubtree(node)) return FILTER_REJECT;
      if (isHiddenText(node)) return FILTER_REJECT;
      const hit =
        "intersectsNode" in range
          ? range.intersectsNode(node)
          : true;
      return hit ? FILTER_ACCEPT : FILTER_REJECT;
    },
  } as NodeFilter);

  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);

  if (texts.length <= 1) return rectArray(range.getClientRects());

  const out: DOMRect[] = [];
  for (const text of texts) {
    const start = text === range.startContainer ? range.startOffset : 0;
    const end = text === range.endContainer ? range.endOffset : text.length;
    if (end <= start) continue;
    const sub = document.createRange();
    sub.setStart(text, start);
    sub.setEnd(text, end);
    pushRects(sub.getClientRects(), out);
  }
  return out;
}

const BBOX_REJECT_RATIO = 3.0;
const MERGE_TOLERANCE = 0.5;
const MERGE_MAX_GAP_RATIO = 1.5;
const COLUMN_SLOP = 24;
const SEED_SCALE = 7;

interface LineBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function toDomRect(box: LineBox): DOMRect {
  const { top, bottom, left, right } = box;
  const width = right - left;
  const height = bottom - top;
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    right,
    bottom,
    left,
    toJSON() {
      return { x: left, y: top, width, height, top, right, bottom, left };
    },
  } as DOMRect;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function mergeRectsToBoxes(rects: DOMRect[]): LineBox[] {
  if (rects.length === 0) return [];

  const heights = rects.map((r) => r.height);
  const med = median(heights);
  const tol = med * MERGE_TOLERANCE;
  const maxH = med * BBOX_REJECT_RATIO;
  const maxGap = med * MERGE_MAX_GAP_RATIO;

  const lines: LineBox[] = [];
  for (const r of rects) {
    if (med > 0 && r.height > maxH) continue;

    const cy = (r.top + r.bottom) / 2;
    let merged = false;
    for (const line of lines) {
      if (Math.abs(cy - (line.top + line.bottom) / 2) >= tol) continue;
      const gap = Math.max(r.left - line.right, line.left - r.right);
      if (gap > maxGap) continue;
      if (r.top < line.top) line.top = r.top;
      if (r.bottom > line.bottom) line.bottom = r.bottom;
      if (r.left < line.left) line.left = r.left;
      if (r.right > line.right) line.right = r.right;
      merged = true;
      break;
    }
    if (!merged) {
      lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
  }

  lines.sort((a, b) => a.top - b.top || a.left - b.left);
  return lines;
}

export function mergeRectsByLine(rects: DOMRect[]): DOMRect[] {
  return mergeRectsToBoxes(rects).map(toDomRect);
}

export function computeAnchor(ranges: Range[]): Anchor {
  let top = Infinity;
  let left = Infinity;

  if (hasDomWithRange()) {
    for (const range of ranges) {
      for (const r of collectRangeRects(range)) {
        if (r.width < 1 || r.height < 1) continue;
        if (r.top < top) top = r.top;
        if (r.left < left) left = r.left;
      }
    }
  }

  if (!Number.isFinite(top)) top = 0;
  if (!Number.isFinite(left)) left = 0;
  return { top, left };
}

export interface RangesToLineRectsOptions {
  scope?: Element;
  columnBounds?: { left: number; right: number };
}

export function rangesToLineRects(
  ranges: Range[],
  anchor?: Anchor,
  originTop = 0,
  options?: RangesToLineRectsOptions,
): LineRect[] {
  if (!hasDomWithRange() || ranges.length === 0) return [];

  const raw: DOMRect[] = [];
  for (const range of ranges) {
    for (const r of collectRangeRects(range, options?.scope)) {
      if (r.width < 1 || r.height < 1) continue;
      raw.push(r);
    }
  }
  if (raw.length === 0) return [];

  const bounds = options?.columnBounds;
  let column = raw;
  if (bounds || anchor) {
    let maxRight = -Infinity;
    for (const r of raw) if (r.right > maxRight) maxRight = r.right;
    const minLeft = (bounds?.left ?? anchor!.left) - COLUMN_SLOP;
    const maxRightBound = (bounds?.right ?? maxRight) + COLUMN_SLOP;
    const filtered: DOMRect[] = [];
    for (const r of raw) {
      if (r.right >= minLeft && r.left <= maxRightBound) filtered.push(r);
    }
    if (filtered.length > 0) column = filtered;
  }

  const lines = mergeRectsToBoxes(column);
  if (lines.length === 0) return [];

  const last = lines.length - 1;
  return lines.map((box, index) => ({
    left: box.left,
    top: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
    seed: Math.round((box.top - originTop) * SEED_SCALE), // origin, not min-top: upward drags must not re-roll seeds
    isFirst: index === 0,
    isLast: index === last,
  }));
}
