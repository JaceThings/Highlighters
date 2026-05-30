/**
 * Entrance animation — the draw-on swipe (blueprint R23–R25).
 *
 * The mark draws itself on by GROWING its own geometry: each animation frame the
 * line's `clip-path` is rebuilt truncated to an advancing front (`clipAtFront`),
 * so the band literally gains grid nodes and its leading edge is always the mark's
 * own tip cap (chisel slant / bullet round / fine) at the current front. Nothing
 * is masked, gradient-faded, or stretched — the ink is laid down exactly like a
 * real highlighter, the tip shape visible throughout. The already-drawn prefix is
 * byte-identical frame to frame (the anchored-grid invariant, R22d): the mark adds
 * nodes, it never scales.
 *
 * The draw clip lives on the per-line WRAPPER, never on its ink/glow children. The
 * renderer owns the children's full geometry clip and rewrites it on every reflow;
 * the draw owns the wrapper's clip and the two never touch the same property on the
 * same element. That separation is load-bearing: a reflow mid-draw (a late web-font
 * load, a resize) re-runs `renderer.update()`, which resets the children to their
 * FULL geometry clip — but the wrapper's front clip is left intact, so the band
 * keeps drawing at its current front instead of flashing to full and restarting.
 * The page-facing `multiply` optic is carried by the overlay CONTAINER (its own
 * `isolation: isolate` + `mix-blend-mode: multiply`), not by the per-line ink, so
 * the wrapper's own clip/opacity (and the stacking context they create) stay nested
 * inside that group and never change how the mark darkens the text underneath.
 *
 * The band finds its wrapper by stable seed (`bandFor`), never by index into the
 * container: several marks share ONE container (all target `document.body`), so an
 * index lookup would alias onto a sibling mark's band — letting N marks' draw-ons
 * all clobber one wrapper. Per-seed lookup keeps each mark on its own bands.
 *
 * The onset wicks in: the wrapper's opacity ramps 0→1 over the first ~120ms (the
 * ink seeping into paper on contact), then holds solid — so the touchdown never
 * hard-pops. And the draw maps progress onto [minFront → width], so the band starts
 * at its tip touchdown width and immediately drags, with no sub-tip clamp plateau.
 *
 * `clip-path` is applied AFTER the ink's edge filter, so the band's TOP/BOTTOM
 * wavy edges stay soft (the filter), while the advancing FRONT is a crisp contact
 * line — which is what a wet leading edge actually looks like. At the end the full
 * clip is restored, so the settled mark has its full soft bleed/glow.
 *
 * - `animation.direction`: `left-to-right` (default) grows from the left;
 *   `right-to-left`/`center-out` fall back to left-to-right (a mirrored front is a
 *   later refinement).
 * - `animation.trigger === "in-view"` arms an `IntersectionObserver`; the draw runs
 *   on first entry and (unless `repeat`) disconnects after firing once (R24).
 * - `env.prefersReducedMotion`, `animation.draw === false`, or no
 *   `requestAnimationFrame` (SSR/test) → the full mark is shown instantly with no
 *   animation (R25/R34).
 *
 * Reflow never re-animates — only first appearance or an explicit re-show does
 * (R22). The returned {@link Disconnect} cancels the rAF + observer and restores
 * each line's full clip so a cancelled mid-draw never strands a truncated mark (R33).
 */

import type {
  Disconnect,
  MarkGeometry,
  ResolvedAnimation,
  RenderEnvironment,
} from "../types.js";

/**
 * Guarded read of `prefers-reduced-motion: reduce`. Returns `false` outside a DOM
 * so the core stays import-safe on the server (R25 / R34).
 *
 * @returns Whether the user has requested reduced motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** A progress easing sampler: maps linear progress `[0,1]` → eased `[0,1]`. */
type Easer = (t: number) => number;

/** The CSS named easings as cubic-bezier control points. */
const NAMED_EASINGS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** A cubic-bezier easing sampler (Newton-Raphson invert of X, then Y). */
function cubicBezierEaser(p1x: number, p1y: number, p2x: number, p2y: number): Easer {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-4) break;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sampleY(t);
  };
}

/** Resolve a CSS easing string to a JS progress sampler (rAF needs a sampler). */
function parseEasing(easing: ResolvedAnimation["easing"]): Easer {
  if (easing === "linear") return (t) => t;
  const named = NAMED_EASINGS[easing];
  if (named) return cubicBezierEaser(...named);
  const m = /cubic-bezier\(([^)]+)\)/.exec(easing);
  if (m) {
    const n = m[1].split(",").map((s) => Number(s.trim()));
    if (n.length === 4 && n.every(Number.isFinite)) {
      return cubicBezierEaser(n[0], n[1], n[2], n[3]);
    }
  }
  return cubicBezierEaser(...NAMED_EASINGS["ease-out"]);
}

/** Set `clip-path` (+ the `-webkit-` alias for older Safari). */
function setClip(el: HTMLElement, path: string): void {
  el.style.clipPath = path;
  el.style.setProperty("-webkit-clip-path", path);
}

/**
 * The onset fade-in duration in ms. Deliberately tiny — just enough to take the
 * hard edge off the touchdown so the band doesn't pop into existence, NOT a fade
 * you should perceive animating. A FIXED time (not a fraction of the draw) so it
 * reads the same whether the pen drags fast or slow; capped at half the draw so a
 * very short draw still softens. Opacity rides the WRAPPER, whose page-facing
 * `multiply` optic is carried by the overlay container (not the ink), so a fading
 * wrapper still darkens the text correctly.
 */
const FADE_IN_MS = 50;

/** The wrapper's opacity for `elapsedMs` into the draw: ramp in over `fadeMs`, then 1. */
function fadeOpacity(elapsedMs: number, fadeMs: number): string {
  if (elapsedMs >= fadeMs) return "";
  return (Math.max(0, elapsedMs) / fadeMs).toFixed(3);
}

/**
 * Resolve a line's stable seed to the wrapper element the draw-on clips. Several
 * marks can share ONE overlay container (every mark targets `document.body`, and
 * the container is idempotent per host), so the wrappers of unrelated marks are
 * siblings. Identifying THIS mark's wrappers by index into `container.children`
 * would alias onto another mark's bands — the cause of the "draws twice" bug, where
 * four marks' draw-ons all wrote the first mark's wrapper. The renderer owns each
 * line's wrapper keyed by seed, so we ask it directly. Returns `null` for tiers
 * with no overlay DOM (Tier C) or a line not (yet) mounted.
 */
type BandFor = (seed: number) => HTMLElement | null;

/** One line's draw state: the wrapper to clip + how to (re)build its clip. */
interface DrawItem {
  node: HTMLElement;
  full: string;
  build: (front: number) => string;
  width: number;
  minFront: number;
  startMs: number;
}

function drawItems(bandFor: BandFor, lines: MarkGeometry[], stagger: number): DrawItem[] {
  const items: DrawItem[] = [];
  lines.forEach((line, i) => {
    const node = bandFor(line.seed);
    if (!node) return;
    items.push({
      node,
      full: line.clipPath,
      build: line.clipAtFront,
      width: line.box.width,
      minFront: line.minFront,
      startMs: i * stagger,
    });
  });
  return items;
}

/** Restore every wrapper to its full (settled) clip and full opacity. */
function showFull(items: DrawItem[]): void {
  for (const it of items) {
    setClip(it.node, it.full);
    it.node.style.opacity = "";
  }
}

/**
 * A {@link Disconnect} for the draw-on, plus `retarget`: re-point an IN-FLIGHT
 * draw-on at freshly-built geometry without restarting its clock. The renderer
 * calls this on reflow so a late web-font load (which corrects a line's measured
 * height mid-entrance) is followed seamlessly — the band keeps drawing at its
 * current progress on the corrected shape instead of finishing the stale one and
 * snapping. Once the draw has settled, `retarget` only re-shows the full clip (no
 * re-animation — R22).
 */
export type DrawOnHandle = Disconnect & {
  retarget: (lines: MarkGeometry[]) => void;
  /**
   * Replay the draw-on from the start — used by an explicit `handle.show()` so a
   * re-shown mark re-animates (the {@link MarkHandle} `show` contract / R24). When
   * motion is reduced or drawing is off, this just re-shows the full mark.
   */
  replay: () => void;
};

/** Attach `retarget`/`replay` to a disconnect function, forming a {@link DrawOnHandle}. */
function asHandle(
  disconnect: Disconnect,
  retarget: DrawOnHandle["retarget"],
  replay: DrawOnHandle["replay"],
): DrawOnHandle {
  return Object.assign(disconnect, { retarget, replay });
}

/**
 * Run the draw-on across the wrappers in `container`, or show them instantly when
 * motion is reduced, drawing is disabled, or no `requestAnimationFrame` exists.
 *
 * The draw rebuilds each line's `clip-path` per frame at an advancing front, so the
 * band grows by adding nodes (the leading edge is the mark's own tip cap), then
 * restores the full clip at the end. `stagger` offsets each line so a wrapped mark
 * reads as one continuous pen travel.
 *
 * @returns A {@link DrawOnHandle} cancelling the rAF/observer + restoring full clips
 *   (R33), with `retarget` for reflow-corrected geometry.
 */
export function applyDrawOn(
  container: HTMLElement,
  bandFor: BandFor,
  lines: MarkGeometry[],
  animation: ResolvedAnimation,
  env: RenderEnvironment,
): DrawOnHandle {
  if (lines.length === 0) return asHandle(() => {}, () => {}, () => {});

  let items = drawItems(bandFor, lines, animation.stagger);
  if (items.length === 0) return asHandle(() => {}, () => {}, () => {});

  // Reduced motion / draw off / no rAF → instant full mark, no animation (R25/R34).
  if (
    env.prefersReducedMotion ||
    !animation.draw ||
    typeof requestAnimationFrame === "undefined"
  ) {
    showFull(items);
    // A reflow just re-shows the corrected full mark — there is no animation to
    // keep — and an explicit re-show likewise just re-asserts the full clip.
    return asHandle(
      () => {},
      (next) => showFull(drawItems(bandFor, next, animation.stagger)),
      () => showFull(items),
    );
  }

  const ease = parseEasing(animation.easing);
  const duration = Math.max(1, animation.duration);
  // Onset fade is a fixed wall-clock time (capped at half the draw for very short
  // draws), so the seep reads the same regardless of the draw's overall speed.
  const fadeMs = Math.min(FADE_IN_MS, duration * 0.5);
  let raf = 0;
  let startTime = 0;
  let observer: IntersectionObserver | null = null;
  let played = false;

  /** Park a line closed (front 0 → an empty clip), hiding it until its turn. */
  function primeClosed(it: DrawItem): void {
    setClip(it.node, it.build(0));
  }

  function frame(now: number): void {
    if (startTime === 0) startTime = now;
    let done = true;
    for (const it of items) {
      const elapsed = now - startTime - it.startMs;
      const t = elapsed / duration;
      if (t >= 1) {
        setClip(it.node, it.full);
        it.node.style.opacity = "";
        continue;
      }
      done = false;
      // Map progress onto [minFront → width]: at p→0 the band touches down at its
      // tip (minFront) and immediately drags. Front 0 (t ≤ 0) stays the empty
      // pre-ink clip, so a staggered line is hidden until its turn. Without this,
      // mapping onto [0 → width] makes `build` clamp every sub-tip front up to
      // minFront — the band pops to the tip width then sits frozen (the start pause).
      const p = t <= 0 ? 0 : ease(t);
      const front = p <= 0 ? 0 : it.minFront + p * (it.width - it.minFront);
      setClip(it.node, it.build(front));
      // Wick the onset in (ink seeping into paper) rather than hard-popping.
      it.node.style.opacity = fadeOpacity(elapsed, fadeMs);
    }
    raf = done ? 0 : requestAnimationFrame(frame);
  }

  function play(): void {
    startTime = 0;
    for (const it of items) primeClosed(it);
    raf = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  if (animation.trigger === "in-view" && typeof IntersectionObserver !== "undefined") {
    // Park closed immediately so the marks are hidden until they enter view.
    for (const it of items) primeClosed(it);
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (!visible) return;
        if (played && !animation.repeat) return;
        if (animation.repeat) stop();
        played = true;
        play();
        if (!animation.repeat) {
          observer?.disconnect();
          observer = null;
        }
      },
      { threshold: animation.threshold, rootMargin: animation.rootMargin },
    );
    observer.observe(container);
  } else {
    played = true;
    play();
  }

  /**
   * Re-point the draw at `next` geometry. If the rAF is still running, just swap
   * the items — the frame loop keeps its `startTime`, so progress is preserved and
   * the next frame draws the corrected shape (seamless on a late font-load reflow).
   * If the draw has already settled, only re-show the corrected full clip.
   */
  function retarget(next: MarkGeometry[]): void {
    items = drawItems(bandFor, next, animation.stagger);
    if (raf !== 0) return; // mid-draw: keep drawing on the corrected geometry
    // Settled → re-show the corrected full clip. Armed in-view but not yet played
    // → keep the band parked closed, so a reflow that lands before the mark enters
    // view can't flash it fully-drawn (then restart when it finally plays).
    if (played) showFull(items);
    else for (const it of items) primeClosed(it);
  }

  /** Replay the draw-on from the start (an explicit re-show re-animates, R24). */
  function replay(): void {
    stop();
    played = true;
    play();
  }

  return asHandle(
    () => {
      stop();
      observer?.disconnect();
      observer = null;
      // Never strand a cancelled mid-draw as a truncated mark.
      showFull(items);
    },
    retarget,
    replay,
  );
}
