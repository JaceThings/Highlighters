import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import type { MarkType } from "@highlighters/core";
import { STATE_CHANGE_EASE } from "../components/playground/springs.ts";
import { prefersReducedMotion } from "./useSpringNumber.ts";

// A mark-type change can't be morphed smoothly (rebuilding the band's clip every frame
// re-rasterizes the SVG-filtered marks and starves the animation). So animate it by
// opacity only: fade the mark out, swap the type while it's invisible (which also hides
// the one-off rebuild), then fade back in. Opacity changes never touch the clip, so this
// stays smooth.
const HALF_MS = 150; // each of the fade-out and fade-in halves
const TWEEN = { type: "tween" as const, duration: HALF_MS / 1000, ease: STATE_CHANGE_EASE };

/**
 * Animate a mark-type change as a fade-out / swap / fade-in. Returns the mark type to
 * render right now and a 0-1 opacity factor to scale the mark's alpha by. Reduced motion
 * swaps instantly.
 */
export function useMarkTypeFade(target: MarkType): { markType: MarkType; factor: number } {
  const [displayed, setDisplayed] = useState(target);
  const [factor, setFactor] = useState(1);
  const o = useMotionValue(1);
  const prev = useRef(target);
  const active = useRef<ReturnType<typeof animate> | null>(null);

  useMotionValueEvent(o, "change", setFactor);

  useEffect(() => {
    if (prev.current === target) return;
    prev.current = target;
    if (prefersReducedMotion()) {
      setDisplayed(target);
      setFactor(1);
      return;
    }
    active.current?.stop();
    const out = animate(o, 0, TWEEN);
    active.current = out;
    out
      .then(() => {
        setDisplayed(target); // swap at the invisible dip
        active.current = animate(o, 1, TWEEN);
      })
      .catch(() => {});
    return () => {
      active.current?.stop();
      active.current = null;
    };
  }, [target, o]);

  return { markType: displayed, factor };
}
