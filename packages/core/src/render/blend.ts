import type { BlendMode, ColorValue } from "../types.js";

const NEAR_WHITE_MIN = 217;
const OFF_WHITE = "#d6d6d6";

export interface InkPlan {
  layer: BlendMode | null;
  color: ColorValue;
}

function parseRgba(color: string): [number, number, number, number] | null {
  const c = color.trim();
  if (c[0] === "#") {
    const h = c.slice(1);
    const short = h.length === 3 || h.length === 4;
    if (!short && h.length !== 6 && h.length !== 8) return null;
    const step = short ? 1 : 2;
    const at = (i: number) => parseInt(short ? h[i].repeat(2) : h.slice(i, i + 2), 16);
    const hasAlpha = h.length === 4 || h.length === 8;
    const out: [number, number, number, number] = [at(0), at(step), at(2 * step), hasAlpha ? at(3 * step) / 255 : 1];
    return out.some(Number.isNaN) ? null : out;
  }
  const m = /^rgba?\(([^)]+)\)/i.exec(c);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return p.length >= 3 && p.slice(0, 3).every(Number.isFinite)
    ? [p[0], p[1], p[2], p[3] ?? 1]
    : null;
}

export function colorMinChannel(color: ColorValue): number | null {
  const c = parseRgba(color);
  return c ? Math.min(c[0], c[1], c[2]) : null;
}

let probe: CanvasRenderingContext2D | null | undefined;

function minChannel(color: ColorValue, doc: Document): number | null {
  const direct = colorMinChannel(color);
  if (direct !== null) return direct;
  try {
    if (probe === undefined) probe = doc.createElement("canvas").getContext("2d");
    if (probe) {
      probe.fillStyle = "#000";
      probe.fillStyle = color;
      return colorMinChannel(String(probe.fillStyle));
    }
  } catch {
    probe = undefined;
  }
  return null;
}

function backdropIsLight(el: Element | null, doc: Document): boolean {
  const view = doc.defaultView;
  if (!view) return true;
  for (let node = el; node; node = node.parentElement) {
    const c = parseRgba(view.getComputedStyle(node).backgroundColor);
    if (c && c[3] > 0.5) return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 >= 0.5;
  }
  return true;
}

export function effectiveInk(
  blendMode: BlendMode,
  color: ColorValue,
  backdrop: Element | null,
  doc: Document,
  vivid: boolean | "screen" = false,
): InkPlan {
  if (vivid) return { layer: vivid === "screen" ? "screen" : "normal", color };
  if (blendMode !== "multiply") return { layer: null, color };
  const min = minChannel(color, doc);
  if (min === null || min < NEAR_WHITE_MIN) return { layer: null, color };
  return backdropIsLight(backdrop, doc)
    ? { layer: null, color: OFF_WHITE }
    : { layer: "normal", color };
}
