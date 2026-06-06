import { useEffect, useMemo, useRef } from "react";
import getStroke from "perfect-freehand";
import type { Squiggle, PressurePoint } from "./squiggles.ts";
import { outlineViewBox, samplePath, toPath } from "./freehand.ts";

// A hand-drawn marker underline: sample a squiggle's centreline and run it through Perfect Freehand
// each frame so the stroke lays down along the path, ink spreading to full width just behind the nib.

const SIZE = 3.4;
const THINNING = 0.65;
const SMOOTHING = 0.5;
const STREAMLINE = 0.4;
const N = 64;
const DRAW_MS = 240;
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
    return { samples, staticD: toPath(outline), viewBox: outlineViewBox(outline) };
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
    el.setAttribute("d", ""); // nib hasn't touched down yet

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
