import { useEffect, useMemo, useRef } from "react";
import getStroke from "perfect-freehand";
import type { Squiggle, PressurePoint } from "./squiggles.ts";

// A hand-drawn marker underline, drawn the way the site's dividers are: take a squiggle's
// centreline, sample it into points, and run it through Perfect Freehand each frame so the
// stroke is laid down *along the path* (the ink spreading to full width just behind the
// nib). Pass any of the SQUIGGLES (see squiggles.ts) — they're real divider strokes, so the
// underline can look freshly hand-drawn each time.

const SIZE = 3.4; // fatter ink
const THINNING = 0.65;
const SMOOTHING = 0.5;
const STREAMLINE = 0.4;
const N = 64;
const DRAW_MS = 240; // quick scribble
const SPREAD_MS = 80;
const SPREAD_POW = 2.5;

const strokeOpts = (last: boolean) => ({
  size: SIZE,
  thinning: THINNING,
  smoothing: SMOOTHING,
  streamline: STREAMLINE,
  simulatePressure: false,
  start: { cap: true, taper: 0 },
  end: { cap: true, taper: 0 },
  last,
});

function lerpPressure(c: PressurePoint[], t: number): number {
  if (!c || !c.length) return 0.5;
  if (t <= c[0].t) return c[0].pressure;
  if (t >= c[c.length - 1].t) return c[c.length - 1].pressure;
  for (let i = 0; i < c.length - 1; i++) {
    const a = c[i];
    const b = c[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = (t - a.t) / (b.t - a.t);
      return a.pressure + (b.pressure - a.pressure) * (3 * p * p - 2 * p * p * p);
    }
  }
  return c[c.length - 1].pressure;
}

// Evenly sample n points along a path's length (uses a throwaway off-screen SVG). Cached at
// module level so the DOM measurement runs once per unique path string — keeping the caller's
// render-time useMemo free of repeat side effects and skipping re-measurement on remount.
const pathCache = new Map<string, [number, number][]>();
function samplePath(d: string, n: number): [number, number][] {
  const key = `${d}:${n}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.cssText = "position:absolute;visibility:hidden;width:0;height:0";
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  svg.appendChild(p);
  document.body.appendChild(svg);
  try {
    const len = p.getTotalLength();
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const pt = p.getPointAtLength((i / (n - 1)) * len);
      pts.push([pt.x, pt.y]);
    }
    pathCache.set(key, pts);
    return pts;
  } finally {
    document.body.removeChild(svg);
  }
}

// getStroke outline → closed SVG path with quadratic midpoints.
function toPath(pts: number[][]): string {
  if (pts.length < 2) return "";
  const d = [`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const c = pts[i];
    const nx = pts[i + 1];
    d.push(`Q ${c[0].toFixed(2)} ${c[1].toFixed(2)} ${((c[0] + nx[0]) / 2).toFixed(2)} ${((c[1] + nx[1]) / 2).toFixed(2)}`);
  }
  d.push("Z");
  return d.join(" ");
}

export function MarkUnderline({
  squiggle,
  color = "#73574a",
  opacity = 0.8,
  animate = true,
}: {
  squiggle: Squiggle;
  color?: string;
  opacity?: number;
  /** Draw it on along the path; false renders the finished stroke instantly. */
  animate?: boolean;
}) {
  const pathRef = useRef<SVGPathElement>(null);

  const { samples, staticD, viewBox } = useMemo(() => {
    const raw = samplePath(squiggle.d, N);
    const samples = raw.map((p, i) => [p[0], p[1], lerpPressure(squiggle.pressure, i / (N - 1))] as [number, number, number]);
    const outline = getStroke(samples, strokeOpts(true));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of outline) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const pad = 1;
    const viewBox = `${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)} ${(maxX - minX + 2 * pad).toFixed(2)} ${(maxY - minY + 2 * pad).toFixed(2)}`;
    return { samples, staticD: toPath(outline), viewBox };
  }, [squiggle]);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduce) {
      el.setAttribute("d", staticD);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    el.setAttribute("d", ""); // nib hasn't touched down

    const tick = (now: number) => {
      const e = now - t0;
      const head = Math.min(1, e / DRAW_MS);
      const last = Math.min(Math.floor(head * (N - 1)) + 1, N);
      const live: number[][] = [];
      for (let i = 0; i < last; i++) {
        const t = i / (N - 1);
        const age = e - t * DRAW_MS;
        const spread = 1 - Math.pow(1 - Math.min(1, age / SPREAD_MS), SPREAD_POW);
        live.push([samples[i][0], samples[i][1], samples[i][2] * spread]);
      }
      el.setAttribute("d", live.length < 2 ? "" : toPath(getStroke(live, strokeOpts(head >= 1))));
      if (e < DRAW_MS + SPREAD_MS) raf = requestAnimationFrame(tick);
      else el.setAttribute("d", staticD);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [samples, staticD, animate]);

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }}
    >
      <path ref={pathRef} fill={color} opacity={opacity} />
    </svg>
  );
}
