// Pure OKLCH helpers. Uses the standard sRGB->OKLab matrices (Björn Ottosson).

export type Oklch = { L: number; C: number; H: number };

const HEX_RE = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i;

// Parse "#rrggbb" (or "rrggbb") to [r, g, b] in 0-255; [0, 0, 0] on a malformed string.
function hexToRgb255(hex: string): [number, number, number] {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function hexToOklch(hex: string): Oklch {
  const [r0, g0, b0] = hexToRgb255(hex).map((c) => c / 255);

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

// #rrggbb -> "r, g, b" (0–255), for `rgba(<this>, α)` strings.
export function hexToRgb(hex: string): string {
  return hexToRgb255(hex).join(", ");
}

export type Hsl = { h: number; s: number; l: number };

// HSL with H in 0–360, S/L in 0–100, matching the picker sliders.
export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb255(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = lN - c / 2;
  const to255 = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to255(r1)}${to255(g1)}${to255(b1)}`;
}

// CSS Color 4 oklch() literal - accepted in SVG fill/stop-color/flood-color.
export function oklchToCss(c: Oklch): string {
  return `oklch(${c.L.toFixed(4)} ${c.C.toFixed(4)} ${c.H.toFixed(2)})`;
}

// OKLCH -> "rgb(r, g, b)" via the inverse Ottosson matrices, gamut-clipped to sRGB.
// Output is a plain rgb() string so it drops into any colour context (gradients,
// color-mix) without relying on oklch() parsing support.
export function oklchToRgb({ L, C, H }: Oklch): string {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const enc = (v: number) => {
    const g = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(g * 255)));
  };
  return `rgb(${enc(lr)}, ${enc(lg)}, ${enc(lb)})`;
}

export function lightenOklch(c: Oklch, dL: number): Oklch {
  return { L: Math.min(1, c.L + dL), C: c.C, H: c.H };
}

// The canonical way to interpolate between two colours. Mixing in OKLCH (not sRGB)
// holds chroma up across the blend, so a swap glides through a saturated hue instead
// of dipping toward grey; hue takes the shortest way round the wheel. For an animated
// colour change reach for `useAnimatedColor`, which tweens `t` 0->1 through this.
export function mixOklch(a: Oklch, b: Oklch, t: number): Oklch {
  const dH = ((b.H - a.H + 540) % 360) - 180; // shortest signed hue delta
  return {
    L: a.L + (b.L - a.L) * t,
    C: a.C + (b.C - a.C) * t,
    H: a.H + dH * t,
  };
}

export function parseOklch(str: string): Oklch {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/i.exec(str);
  if (!m) return { L: 0, C: 0, H: 0 };
  return { L: parseFloat(m[1]), C: parseFloat(m[2]), H: parseFloat(m[3]) };
}
