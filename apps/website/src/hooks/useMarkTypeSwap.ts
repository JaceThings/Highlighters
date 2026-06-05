import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import type { MarkType } from "@highlighters/core";
import { STATE_CHANGE_EASE } from "../components/playground/springs.ts";
import { prefersReducedMotion } from "./useSpringNumber.ts";

// A mark-type change can't be morphed smoothly (rebuilding the band's clip every frame
// re-rasterizes the SVG-filtered marks). So play it as a two-beat hand gesture: fade the
// OLD mark out by opacity, then REDRAW the new one with its draw-on swipe. The redraw is
// triggered by bumping `drawKey` - the caller folds it into the mark's React key, so the
// mark remounts and replays its entrance. The opacity-only fade-out never touches the clip,
// so the first beat stays smooth; the second beat is the renderer's own draw-on.
const FADE_OUT_MS = 150;
const FADE_OUT = { type: "tween" as const, duration: FADE_OUT_MS / 1000, ease: STATE_CHANGE_EASE };

export interface MarkTypeSwap {
  /** The mark type to render right now: the old one through the fade-out, then the target. */
  markType: MarkType;
  /** 0-1 alpha to scale the mark by: ramps to 0 during fade-out, snaps back to 1 for the redraw. */
  factor: number;
  /** Bumps once per swap; fold it into the mark's React key so it remounts and draws on. */
  drawKey: number;
}

/**
 * Animate a mark-type change as fade-out → redraw. Returns the mark type to render now, a
 * 0-1 opacity factor to scale the mark's alpha by, and a `drawKey` to key the mark on so it
 * remounts and replays its draw-on once the old one has faded. Reduced motion swaps in place.
 */
export function useMarkTypeSwap(target: MarkType): MarkTypeSwap {
  const [displayed, setDisplayed] = useState(target);
  const [factor, setFactor] = useState(1);
  const [drawKey, setDrawKey] = useState(0);
  const o = useMotionValue(1);
  const prev = useRef(target);
  const active = useRef<ReturnType<typeof animate> | null>(null);

  useMotionValueEvent(o, "change", setFactor);

  useEffect(() => {
    if (prev.current === target) return;
    prev.current = target;
    if (prefersReducedMotion()) {
      setDisplayed(target); // in-place reshape, no remount/redraw
      setFactor(1);
      return;
    }
    active.current?.stop();
    const out = animate(o, 0, FADE_OUT);
    active.current = out;
    out
      .then(() => {
        // At the invisible dip: swap the type, restore full alpha (also rearming `o` for the
        // next swap), and bump drawKey so the new mark remounts and draws itself on.
        o.set(1);
        setDisplayed(target);
        setDrawKey((k) => k + 1);
      })
      .catch(() => {});
    return () => {
      active.current?.stop();
      active.current = null;
    };
  }, [target, o]);

  return { markType: displayed, factor, drawKey };
}
