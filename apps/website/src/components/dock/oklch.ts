// Pure OKLCH helpers (no React). Used to convert swatch hex to OKLCH and to
// derive the pen tip's specular highlight from perceptual lightness. Conversion
// uses the standard sRGB->OKLab matrices (Björn Ottosson).

export type Oklch = { L: number; C: number; H: number };

// #rrggbb -> OKLCH. Parses to linear-light RGB, projects through OKLab, then
// converts the a/b axes to chroma/hue (degrees).
export function hexToOklch(hex: string): Oklch {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  const [r0, g0, b0] = m
    ? [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255)
    : [0, 0, 0];

  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = lin(r0);
  const g = lin(g0);
  const b = lin(b0);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const mm = Math.cbrt(m_);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * mm - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * mm + 0.4505937099 * s_;
  const Bb = 0.0259040371 * l_ + 0.7827717662 * mm - 0.808675766 * s_;

  const C = Math.hypot(A, Bb);
  const H = ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

// CSS Color 4 oklch() literal. Modern Chrome/Safari accept this in SVG
// fill/stop-color/flood-color.
export function oklchToCss(c: Oklch): string {
  return `oklch(${c.L.toFixed(4)} ${c.C.toFixed(4)} ${c.H.toFixed(2)})`;
}

// Lighten by raising lightness, holding chroma/hue. Used for the tip's
// specular top stop and rim.
export function lightenOklch(c: Oklch, dL: number): Oklch {
  return { L: Math.min(1, c.L + dL), C: c.C, H: c.H };
}

// Read an "oklch(L C H)" string (plain numbers) back into an Oklch.
export function parseOklch(str: string): Oklch {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/i.exec(str);
  if (!m) return { L: 0, C: 0, H: 0 };
  return { L: parseFloat(m[1]), C: parseFloat(m[2]), H: parseFloat(m[3]) };
}
