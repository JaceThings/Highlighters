/**
 * Entrance animation — the draw-on swipe (blueprint R23–R25).
 *
 * Each line band is "drawn on" by animating a `clip-path: inset(...)` that opens
 * from one end to the other, mimicking a pen swiped across the text. Duration,
 * easing, direction, and per-line stagger are configurable (R23); `in-view`
 * triggering arms an `IntersectionObserver` (one-shot unless `repeat`, R24); and
 * under `prefers-reduced-motion: reduce` (or with `draw: false`) the mark is shown
 * fully and instantly in both the JS and the CSS path (R25).
 *
 * Reflow never re-animates — only first appearance or an explicit re-show does
 * (R22). The returned {@link Disconnect} cancels every timer and observer, so a
 * removed or re-shown mark leaves no pending work (R33).
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

/** The `clip-path: inset(...)` that hides a band before its swipe begins. */
function hiddenInset(direction: ResolvedAnimation["direction"]): string {
  switch (direction) {
    case "right-to-left":
      return "inset(0 0 0 100%)";
    case "center-out":
      return "inset(0 50% 0 50%)";
    case "left-to-right":
    default:
      return "inset(0 100% 0 0)";
  }
}

/** The fully-revealed inset (no clipping). */
const SHOWN_INSET = "inset(0 0 0 0)";

/** Find the per-line band elements the renderer mounted into `container`. */
function bandElements(container: HTMLElement): HTMLElement[] {
  // Direct element children are the per-line bands (ink and, for Tier A, glow).
  // We animate the ink bands; identifying them by being the topmost child per
  // line keeps glow in lockstep visually since both share the same box.
  return Array.from(container.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement,
  );
}

/** Show every band instantly with no transition (the reduced-motion path). */
function showInstant(container: HTMLElement): void {
  for (const el of bandElements(container)) {
    el.style.transition = "";
    el.style.clipPath = SHOWN_INSET;
    (el.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = SHOWN_INSET;
    el.style.visibility = "";
  }
}

/**
 * Run the draw-on swipe across the bands in `container`, or show them instantly
 * when motion is reduced or drawing is disabled.
 *
 * - `animation.trigger === "in-view"` arms an `IntersectionObserver` with the
 *   configured `threshold`/`rootMargin`; the swipe runs on first entry and (unless
 *   `animation.repeat`) the observer disconnects after firing once (R24).
 * - Otherwise the swipe runs immediately.
 * - `env.prefersReducedMotion` or `animation.draw === false` shows the mark fully
 *   and instantly with no timers (R25).
 *
 * The clip-path of each band already carries its chisel/bullet geometry, so the
 * draw-on composes by animating a *wrapper* transform is avoided — instead we
 * animate the inset on the same node and rely on the renderer's own `clip-path`
 * being re-applied after the swipe completes (the final state is the renderer's
 * geometry, not `SHOWN_INSET`). To keep the renderer's geometry intact, the swipe
 * uses a CSS `transition` on `clip-path` only when the band has no geometry clip;
 * when it does, we animate `transform: scaleX()` from the swipe origin instead.
 *
 * @returns A {@link Disconnect} cancelling all timers/observers (R33).
 */
export function applyDrawOn(
  container: HTMLElement,
  lines: MarkGeometry[],
  animation: ResolvedAnimation,
  env: RenderEnvironment,
): Disconnect {
  // Nothing to draw when the mark has no geometry.
  if (lines.length === 0) return () => {};

  const bands = bandElements(container);

  // Reduced motion or drawing disabled → instant full mark, no timers (R25).
  if (env.prefersReducedMotion || prefersReducedMotion() || !animation.draw) {
    showInstant(container);
    return () => {};
  }

  if (bands.length === 0) return () => {};

  const timers = new Set<ReturnType<typeof setTimeout>>();
  let observer: IntersectionObserver | null = null;
  let played = false;

  /** Whether a band carries renderer geometry we must preserve after the swipe. */
  function usesTransform(el: HTMLElement): boolean {
    const clip =
      el.style.clipPath ||
      (el.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath ||
      "";
    // A path()/polygon clip is renderer geometry; we must not overwrite it, so we
    // swipe via a transform instead of the inset.
    return clip.includes("path(") || clip.includes("polygon(");
  }

  /** Set a band to its pre-swipe hidden state. */
  function prime(el: HTMLElement): void {
    el.style.transition = "none";
    if (usesTransform(el)) {
      const origin =
        animation.direction === "right-to-left"
          ? "right center"
          : animation.direction === "center-out"
            ? "center center"
            : "left center";
      el.style.transformOrigin = origin;
      el.style.transform = "scaleX(0)";
    } else {
      const hidden = hiddenInset(animation.direction);
      el.style.clipPath = hidden;
      (el.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = hidden;
    }
  }

  /** Reveal a band with the configured duration/easing after `delay` ms. */
  function reveal(el: HTMLElement, delay: number): void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      const transitionProp = usesTransform(el) ? "transform" : "clip-path";
      el.style.transition = `${transitionProp} ${animation.duration}ms ${animation.easing}`;
      if (usesTransform(el)) {
        el.style.transform = "scaleX(1)";
      } else {
        el.style.clipPath = SHOWN_INSET;
        (el.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = SHOWN_INSET;
      }
    }, delay);
    timers.add(timer);
  }

  /** Prime every band, then stagger each band's reveal. */
  function play(): void {
    for (const el of bands) prime(el);
    // Force the primed state to commit before transitioning (next macro task).
    const kickoff = setTimeout(() => {
      timers.delete(kickoff);
      bands.forEach((el, i) => reveal(el, i * animation.stagger));
    }, 0);
    timers.add(kickoff);
  }

  /** Clear pending timers and reset transitions (used between repeat cycles). */
  function reset(): void {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }

  if (animation.trigger === "in-view" && typeof IntersectionObserver !== "undefined") {
    // Prime immediately so the bands are hidden until they enter view.
    for (const el of bands) prime(el);
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (!visible) return;
        if (played && !animation.repeat) return;
        if (animation.repeat) reset();
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

  return () => {
    reset();
    observer?.disconnect();
    observer = null;
  };
}
