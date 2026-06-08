/**
 * Luminance-aware overlay blend selection.
 *
 * The overlay composites with `mix-blend-mode: multiply` by default - the subtractive-ink optic that
 * lets text show through and overlaps darken. But multiply is `backdrop x ink`, so a near-white ink
 * (every channel ~1) barely darkens anything: it's invisible on a light page, and on a dark page
 * multiply drives every colour to black. So for a near-white ink we composite the overlay `normal`
 * instead, painting a real translucent wash that stays visible (notably on dark backgrounds).
 *
 * We test the per-channel MINIMUM, not luminance: highlighter yellow (`#ffff00`) has high luminance
 * but a zero blue channel, so multiply still tints it - only a colour whose every channel is high
 * actually vanishes. Any explicit non-multiply blend the caller chose is always respected.
 */

import type { BlendMode, ColorValue } from "../types.js";

// ~0.85 of 255: below this the ink still darkens enough under multiply to read.
const NEAR_WHITE_MIN = 217;

/** Parse `#rgb(a)`, `#rrggbb(aa)`, or `rgb()/rgba()` to 0-255 RGB. Pure; null for other notations. */
function parseHexOrRgb(color: string): [number, number, number] | null {
  const c = color.trim();
  if (c[0] === "#") {
    const h = c.slice(1);
    const short = h.length === 3 || h.length === 4;
    const long = h.length === 6 || h.length === 8;
    if (!short && !long) return null;
    const step = short ? 1 : 2;
    const at = (i: number) => {
      const slice = short ? h[i].repeat(2) : h.slice(i, i + 2);
      return parseInt(slice, 16);
    };
    const rgb: [number, number, number] = [at(0), at(step), at(step * 2)];
    return rgb.some(Number.isNaN) ? null : rgb;
  }
  const m = /^rgba?\(([^)]+)\)/i.exec(c);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number).slice(0, 3);
  return parts.length === 3 && parts.every(Number.isFinite)
    ? (parts as [number, number, number])
    : null;
}

/** Smallest RGB channel (0-255) of a colour, or null if it can't be parsed without a browser. Pure; exported for tests. */
export function colorMinChannel(color: ColorValue): number | null {
  const rgb = parseHexOrRgb(color);
  return rgb ? Math.min(rgb[0], rgb[1], rgb[2]) : null;
}

// Exotic notations (named colours, hsl/oklch, currentColor) need the browser to normalise. Cache the
// per-colour result and reuse one throwaway canvas; an unparseable value leaves the "#000" sentinel,
// which reads as a dark ink and safely keeps multiply.
const normalizeCache = new Map<string, number | null>();
let probe: CanvasRenderingContext2D | null | undefined;

function minChannel(color: ColorValue, doc: Document): number | null {
  const direct = colorMinChannel(color);
  if (direct !== null) return direct;
  const cached = normalizeCache.get(color);
  if (cached !== undefined) return cached;
  let result: number | null = null;
  try {
    if (probe === undefined) probe = doc.createElement("canvas").getContext("2d");
    if (probe) {
      probe.fillStyle = "#000";
      probe.fillStyle = color;
      result = colorMinChannel(probe.fillStyle as string);
    }
  } catch {
    result = null;
  }
  normalizeCache.set(color, result);
  return result;
}

/**
 * The blend mode to composite the overlay with for a given ink. The default `multiply` falls back to
 * `normal` for a near-white ink so it stays visible; any explicit non-multiply blend is kept as-is.
 */
export function effectiveBlend(
  blendMode: BlendMode,
  color: ColorValue,
  doc: Document,
): BlendMode {
  if (blendMode !== "multiply") return blendMode;
  const min = minChannel(color, doc);
  return min !== null && min >= NEAR_WHITE_MIN ? "normal" : "multiply";
}
