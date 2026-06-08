/**
 * Luminance-aware ink compositing.
 *
 * The overlay composites with `mix-blend-mode: multiply` by default - the subtractive-ink optic that
 * lets text show through and overlaps darken. But multiply is `backdrop x ink`, so a near-white ink
 * (every channel ~1) barely darkens anything: it's invisible on a light page, and on a dark page
 * multiply drives every colour to black. {@link effectiveInk} keeps such an ink visible:
 *
 *  - on a DARK backdrop, composite `normal` so the white ink paints a bright translucent wash;
 *  - on a LIGHT backdrop (light-on-light), keep `multiply` but darken the ink to a soft off-white so
 *    it still darkens the page into a faint, visible mark instead of vanishing.
 *
 * Near-white is judged by the per-channel MINIMUM, not luminance: highlighter yellow (`#ffff00`) has
 * high luminance but a zero blue channel, so multiply still tints it - only an all-channels-high
 * colour vanishes. Any explicit non-multiply blend the caller chose is always respected.
 */

import type { BlendMode, ColorValue } from "../types.js";

// ~0.85 of 255: below this the ink still darkens enough under multiply to read.
const NEAR_WHITE_MIN = 217;
// The off-white a near-white ink falls back to on a light backdrop, so multiply leaves a visible wash.
const OFF_WHITE = "#d6d6d6";

/** The colour + blend to actually paint an ink with. */
export interface InkComposite {
  blend: BlendMode;
  color: ColorValue;
}

/** Parse `#rgb(a)`, `#rrggbb(aa)`, or `rgb()/rgba()` to `[r, g, b, a]` (0-255, a 0-1). Null for other notations. */
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

/** Smallest RGB channel (0-255) of a colour, or null if it can't be parsed without a browser. Pure; exported for tests. */
export function colorMinChannel(color: ColorValue): number | null {
  const c = parseRgba(color);
  return c ? Math.min(c[0], c[1], c[2]) : null;
}

// Exotic notations (named colours, hsl/oklch, currentColor) need the browser to normalise via one
// reused throwaway canvas. An unparseable value leaves the "#000" sentinel, which reads as a dark ink
// and safely keeps multiply. The common hex/rgb inks never reach here (colorMinChannel parses them).
let probe: CanvasRenderingContext2D | null | undefined;

function minChannel(color: ColorValue, doc: Document): number | null {
  const direct = colorMinChannel(color);
  if (direct !== null) return direct;
  try {
    if (probe === undefined) probe = doc.createElement("canvas").getContext("2d");
    if (probe) {
      probe.fillStyle = "#000";
      probe.fillStyle = color;
      return colorMinChannel(probe.fillStyle as string);
    }
  } catch {
    // Drop a context that errored (e.g. a torn-down document) so the next call retries with a live one.
    probe = undefined;
  }
  return null;
}

/** Walk up from `el` to the first mostly-opaque background; light when its luminance >= 0.5. Unknown reads as light (default page canvas is white). */
function backdropIsLight(el: Element | null, doc: Document): boolean {
  const view = doc.defaultView;
  if (!view) return true;
  for (let node = el; node; node = node.parentElement) {
    // Skip near-transparent layers (e.g. a faint scrim) so the real surface below decides the verdict.
    const c = parseRgba(view.getComputedStyle(node).backgroundColor);
    if (c && c[3] > 0.5) return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 >= 0.5;
  }
  return true;
}

/**
 * The colour + blend to composite an ink with. A near-white ink under the default `multiply` would
 * vanish, so it switches to `normal` on a dark backdrop (bright wash) or to a soft off-white on a
 * light backdrop (a faint multiply wash). Every other colour, and any explicit blend, is unchanged.
 */
export function effectiveInk(
  blendMode: BlendMode,
  color: ColorValue,
  backdrop: Element | null,
  doc: Document,
): InkComposite {
  if (blendMode !== "multiply") return { blend: blendMode, color };
  const min = minChannel(color, doc);
  if (min === null || min < NEAR_WHITE_MIN) return { blend: "multiply", color };
  return backdropIsLight(backdrop, doc)
    ? { blend: "multiply", color: OFF_WHITE }
    : { blend: "normal", color };
}
