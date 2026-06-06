import { memo, useEffect, useId, useMemo, useRef } from "react";
import getStroke from "perfect-freehand";
import { mulberry } from "@highlighters/core";
import { makeBlobScribble, makeLassoStroke, linePath } from "./scribble-render.ts";
import { toPath } from "./freehand.ts";
import { IS_WEBKIT } from "./is-webkit.ts";

// The colour swatch as a hand-drawn marker scribble, plus the lasso that rings the selected one:
// a seeded scribble fill for the blob, and a Perfect Freehand stroke drawn on along a loop for the lasso.

const VIEW = 40; // square authoring viewBox for the blob
const BLOB_STROKE = 5.4;
const LASSO_INK = "#73574a";

// Subtle paper-wobble on the blob edges.
function BlobFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="2139" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  );
}

// Memoized on stable primitive props, so an option change elsewhere won't re-reconcile the SVG + filter subtrees.
export const ScribbleSwatch = memo(function ScribbleSwatch({ hex, seed, size }: { hex: string; seed: number; size: number }) {
  const filterId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const d = useMemo(() => linePath(makeBlobScribble({ size: VIEW, seed })), [seed]);
  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      aria-hidden
      style={{ display: "block", width: size, height: size, overflow: "visible" }}
    >
      {/* Paper-wobble filter skipped on WebKit (slow turbulence); the scribble shape carries the look. */}
      {!IS_WEBKIT && (
        <defs>
          <BlobFilter id={filterId} />
        </defs>
      )}
      <path
        d={d}
        fill="none"
        stroke={hex}
        strokeWidth={BLOB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={IS_WEBKIT ? undefined : `url(#${filterId})`}
      />
    </svg>
  );
});

// Two prebuilt stroke configs so the rAF loop allocates none; they differ only by `last`.
const LASSO_CAP = { cap: true, taper: 0 };
const LASSO_OPTS_DRAW = { size: 3, thinning: 0.62, smoothing: 0.7, streamline: 0.62, simulatePressure: false, start: LASSO_CAP, end: LASSO_CAP, last: false };
const LASSO_OPTS_LAST = { ...LASSO_OPTS_DRAW, last: true };
const SPREAD_MS = 80;
const SPREAD_POW = 2.5;

/** The selection ring: a hand-drawn loop drawn on along its path (instant under reduced motion).
 *  `seed` varies the wobble per selection; `draw={false}` for a static ring (keyboard-focus preview). */
export function ScribbleLasso({ seed, size, draw = true }: { seed: number; size: number; draw?: boolean }) {
  const pathRef = useRef<SVGPathElement>(null);
  const pts = useMemo(() => makeLassoStroke(size, seed), [seed, size]);
  const staticD = useMemo(() => toPath(getStroke(pts, LASSO_OPTS_LAST)), [pts]);
  // Vary the draw speed per pick so they don't all ring at an identical rate.
  const drawMs = useMemo(() => 50 + mulberry(seed + 9277)() * 100, [seed]);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !draw) {
      el.setAttribute("d", staticD);
      return;
    }
    const n = pts.length;
    let raf = 0;
    const t0 = performance.now();
    el.setAttribute("d", ""); // nib hasn't touched down
    const tick = (now: number) => {
      const e = now - t0;
      const head = Math.min(1, e / drawMs);
      const last = Math.min(Math.floor(head * (n - 1)) + 1, n);
      const live: number[][] = [];
      for (let i = 0; i < last; i++) {
        const t = i / (n - 1);
        const age = e - t * drawMs;
        const spread = 1 - Math.pow(1 - Math.min(1, age / SPREAD_MS), SPREAD_POW);
        live.push([pts[i][0], pts[i][1], pts[i][2] * spread]);
      }
      el.setAttribute("d", live.length < 2 ? "" : toPath(getStroke(live, head >= 1 ? LASSO_OPTS_LAST : LASSO_OPTS_DRAW)));
      if (e < drawMs + SPREAD_MS) raf = requestAnimationFrame(tick);
      else el.setAttribute("d", staticD);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pts, staticD, drawMs, draw]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      style={{ display: "block", width: size, height: size, overflow: "visible" }}
    >
      <path ref={pathRef} fill={LASSO_INK} />
    </svg>
  );
}
