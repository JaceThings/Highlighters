import { mulberry } from "@highlighters/core";

// Scribble geometry for the slider fill: a hand-jittered zigzag, stroked as a smooth spline.

export interface ZigzagParams {
  width: number; // authoring viewBox width (the slider stretches this to the track)
  height: number; // authoring viewBox height
  meanStep: number; // average horizontal gap between teeth (smaller = denser)
  toothHeight: number; // peak-to-peak tooth height in viewBox units
  jitterX: number; // random spacing variance
  jitterY: number; // random peak-height variance
  seed: number;
}

export function makeZigzag(p: ZigzagParams): [number, number][] {
  const r = mulberry(p.seed);
  const jit = (amp: number) => (r() * 2 - 1) * amp;
  const mid = p.height / 2;
  const top = mid - p.toothHeight / 2;
  const bottom = mid + p.toothHeight / 2;
  const pts: [number, number][] = [];
  let x = 0.8 + r() * 0.5;
  let i = 0;
  while (x < p.width - 0.8) {
    pts.push([x, (i % 2 === 0 ? bottom : top) + jit(p.jitterY)]);
    x += p.meanStep + jit(p.jitterX);
    i++;
  }
  return pts;
}

/** Points up to fraction `f` (0..1), interpolating the leading point so the head moves smoothly. */
export function pointsUpTo(pts: [number, number][], f: number): [number, number][] {
  const frac = Math.max(0, Math.min(1, f));
  const exact = frac * (pts.length - 1);
  const whole = Math.floor(exact);
  const t = exact - whole;
  const sub = pts.slice(0, whole + 1);
  if (t > 0 && whole + 1 < pts.length) {
    const a = pts[whole];
    const b = pts[whole + 1];
    sub.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return sub;
}

// SVG `d` for a smooth stroke (caller strokes it, no fill). A Catmull-Rom spline as cubic
// Béziers - passes THROUGH every tooth tip so it keeps full amplitude, unlike midpoint
// corner-cutting which would halve the height.
export function smoothStrokePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 2) return "";
  const f = (x: number) => x.toFixed(2);
  if (n === 2) return `M${f(pts[0][0])} ${f(pts[0][1])}L${f(pts[1][0])} ${f(pts[1][1])}`;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
