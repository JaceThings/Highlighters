import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, type MotionValue } from "framer-motion";
import type { MarkType } from "@highlighters/core";
import { STATE_CHANGE_EASE } from "../components/playground/springs.ts";
import { prefersReducedMotion } from "./useSpringNumber.ts";

// A mark-type change can't morph smoothly (rebuilding the clip every frame re-rasterizes the
// SVG-filtered marks), so play it in two beats: fade the old mark out, then bump `drawKey` to
// remount it and replay the draw-on as the new type. The fade rides a compositor opacity on the
// marks layer (`fade`), never the core opacity option - animating the option re-renders and
// re-rasterizes every visible mark per frame (a Chrome stutter; it has no WebKit filter fallback).
const FADE_OUT_MS = 150;
const FADE_OUT = { type: "tween" as const, duration: FADE_OUT_MS / 1000, ease: STATE_CHANGE_EASE };

export interface MarkTypeSwap {
  /** The mark type to render right now: the old one through the fade-out, then the target. */
  markType: MarkType;
  /** Compositor opacity for the marks layer: 0 through the fade-out, back to 1 for the redraw.
   *  Bind to a wrapper's `style.opacity`, never the core options (see above). */
  fade: MotionValue<number>;
  /** Bumps once per swap; fold it into the mark's React key so it remounts and draws on. */
  drawKey: number;
}

/**
 * Animate a mark-type change as fade-out → redraw. Returns the mark type to render now, a `fade`
 * motion value (1 → 0 → 1) to drive the marks layer's opacity, and a `drawKey` to key the mark on
 * so it remounts and replays its draw-on once the old one has faded. Reduced motion swaps in place.
 */
export function useMarkTypeSwap(target: MarkType): MarkTypeSwap {
  const [displayed, setDisplayed] = useState(target);
  const [drawKey, setDrawKey] = useState(0);
  const fade = useMotionValue(1);
  const prev = useRef(target);
  const active = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    if (prev.current === target) return;
    prev.current = target;
    if (prefersReducedMotion()) {
      setDisplayed(target); // in-place reshape, no remount/redraw
      fade.set(1);
      return;
    }
    active.current?.stop();
    const out = animate(fade, 0, FADE_OUT);
    active.current = out;
    out
      .then(() => {
        // At the invisible dip: swap the type, restore full opacity (rearming the layer for the
        // next swap), and bump drawKey so the new mark remounts and draws itself on.
        fade.set(1);
        setDisplayed(target);
        setDrawKey((k) => k + 1);
      })
      .catch(() => {});
    return () => {
      active.current?.stop();
      active.current = null;
    };
  }, [target, fade]);

  return { markType: displayed, fade, drawKey };
}
