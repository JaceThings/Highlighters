import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, type MotionValue } from "framer-motion";
import type { MarkType } from "@highlighters/core";
import { STATE_CHANGE_EASE } from "../components/playground/springs.ts";
import { prefersReducedMotion } from "./useSpringNumber.ts";

// Mark-type change can't morph smoothly, so fade the old mark out then bump `drawKey` to remount and
// redraw as the new type. Fade rides a compositor opacity (`fade`), never the core opacity option:
// animating that re-rasterizes every mark per frame (Chrome stutter, no WebKit filter fallback).
const FADE_OUT_MS = 150;
const FADE_OUT = { type: "tween" as const, duration: FADE_OUT_MS / 1000, ease: STATE_CHANGE_EASE };

export interface MarkTypeSwap {
  /** The mark type to render now: old through the fade-out, then the target. */
  markType: MarkType;
  /** Compositor opacity for the marks layer (1->0->1). Bind to a wrapper's `style.opacity`, never the core options. */
  fade: MotionValue<number>;
  /** Bumps once per swap; fold into the mark's React key so it remounts and draws on. */
  drawKey: number;
}

/** Animate a mark-type change as fade-out then redraw. Reduced motion swaps in place. */
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
      setDisplayed(target);
      fade.set(1);
      return;
    }
    active.current?.stop();
    const out = animate(fade, 0, FADE_OUT);
    active.current = out;
    out
      .then(() => {
        // At the invisible dip: swap type, restore opacity, bump drawKey to remount and draw on.
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
