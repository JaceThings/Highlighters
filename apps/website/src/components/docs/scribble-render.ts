import { mulberry } from "@highlighters/core";

// Scribble geometry for the slider fill: a hand-jittered zigzag, stroked as a smooth spline.

interface ZigzagParams {
  width: number;
  height: number;
  meanStep: number; // avg horizontal gap between teeth (smaller = denser)
  toothHeight: number; // peak-to-peak, viewBox units
  jitterX: number; // spacing variance
  jitterY: number; // peak-height variance
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

interface BlobParams {
  size: number; // square authoring viewBox (size x size)
  seed: number;
  passes?: number; // diagonal chords (more = denser fill)
  fill?: number; // 0..1 reach toward the circle edge
  jitter?: number; // hand-wobble amplitude, viewBox units
}

// A colour swatch as a hand-scribbled fill: diagonal chords corner-to-corner, each chord's length
// following the circle so the blob is round. Rendered as a round-capped polyline, it reads like a marker scribble.
export function makeBlobScribble(p: BlobParams): [number, number][] {
  const r = mulberry(p.seed);
  const passes = p.passes ?? 11;
  const fill = p.fill ?? 0.95;
  const jit = p.jitter ?? 1.2;
  const c = p.size / 2;
  const R = p.size / 2;
  // ~45deg sweep, wobbled per seed so no two swatches hatch alike.
  const angle = Math.PI / 4 + (r() * 2 - 1) * 0.22;
  const dir = [Math.cos(angle), Math.sin(angle)];
  const perp = [-Math.sin(angle), Math.cos(angle)];
  const span = R * 0.82; // keep chord ends inside the circle
  const pts: [number, number][] = [];
  for (let i = 0; i <= passes; i++) {
    const t = -span + (2 * span * i) / passes + (r() * 2 - 1) * jit * 0.5;
    const half = Math.sqrt(Math.max(0, R * R - t * t)); // chord half-length at t
    const reach = half * fill * (0.88 + r() * 0.24);
    const side = i % 2 === 0 ? 1 : -1;
    pts.push([
      c + dir[0] * t + perp[0] * side * reach + (r() * 2 - 1) * jit,
      c + dir[1] * t + perp[1] * side * reach + (r() * 2 - 1) * jit,
    ]);
  }
  return pts;
}

// A hand-drawn lasso loop (centreline + per-point pressure) for circling the selected swatch.
// Everything jitters per seed (size, ovalness, tilt, crossing) so no two selections ring the same
// circle. It runs past a full turn with both ends splayed outward into a tailed knot near the top,
// like a real pen circle that didn't quite close. Tapered ends draw on like the nib lifting.
export function makeLassoStroke(size: number, seed: number): [number, number, number][] {
  const r = mulberry(seed);
  const N = 80; // dense -> smooth curve
  const c = size / 2;
  const rx = size * (0.355 + r() * 0.035);
  const ry = rx * (0.92 + r() * 0.14); // ovalness
  const tilt = (r() * 2 - 1) * 0.4;
  const cross = -Math.PI / 2 + (r() * 2 - 1) * 0.4; // crossing near the top
  const tailAng = 0.45 + r() * 0.18; // tail splay from the crossing
  const tailOut = 0.18 + r() * 0.08; // tail reach past the ring
  const a0 = cross - tailAng;
  const a1 = cross + Math.PI * 2 + tailAng; // past a full turn, so the ends overshoot and cross
  // One gentle low-frequency swell (no per-point noise) keeps the ring smooth.
  const wobAmp = 0.025 + r() * 0.02;
  const wobFreq = 2 + Math.floor(r() * 2);
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const pts: [number, number, number][] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const a = a0 + u * (a1 - a0);
    // Splay the first and last stretch into the crossing tails.
    const tail = u < 0.12 ? (0.12 - u) / 0.12 : u > 0.88 ? (u - 0.88) / 0.12 : 0;
    const rad = (1 + tail * tailOut) * (1 + Math.sin(a * wobFreq + seed) * wobAmp);
    const ex = Math.cos(a) * rx * rad;
    const ey = Math.sin(a) * ry * rad;
    const pressure = 0.22 + 0.62 * Math.sin(Math.PI * u); // tapered ends, fuller middle
    pts.push([c + ex * cosT - ey * sinT, c + ex * sinT + ey * cosT, pressure]);
  }
  return pts;
}

/** SVG `d` for a straight round-jointed polyline through `pts` (no smoothing). */
export function linePath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  const f = (x: number) => x.toFixed(2);
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${f(p[0])} ${f(p[1])}`).join("");
}

/** Points up to fraction `f` (0..1), interpolating the lead point so the head moves smoothly. */
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

// SVG `d` for a smooth stroke. A Catmull-Rom spline as cubic Beziers: passes THROUGH every tooth
// tip so it keeps full amplitude, unlike midpoint corner-cutting which would halve the height.
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
