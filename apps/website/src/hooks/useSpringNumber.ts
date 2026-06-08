import { useEffect, useRef, useState } from "react";
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion";

export interface SpringNumberOptions {
  duration: number;
  ease: [number, number, number, number];
  /** Drag-driven target: bypass the tween (input is already smooth; a tween on top would lag it). */
  fromDrag?: boolean;
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Tween a `MotionValue<number>` toward `target` without mirroring to React state. Lets a caller
 * coalesce many springs into a single batched read per frame instead of one `setState` per spring.
 * Discrete changes tween; drags and reduced-motion snap.
 */
export function useSpringMotionValue(
  target: number,
  { duration, ease, fromDrag = false }: SpringNumberOptions,
): MotionValue<number> {
  const mv = useMotionValue(target);
  const fromDragRef = useRef(fromDrag);
  fromDragRef.current = fromDrag;

  // Destructure ease so a fresh literal each render doesn't restart the tween mid-flight.
  const [e0, e1, e2, e3] = ease;
  useEffect(() => {
    if (fromDragRef.current || prefersReducedMotion()) {
      mv.set(target);
      return;
    }
    const controls = animate(mv, target, {
      type: "tween",
      duration,
      ease: [e0, e1, e2, e3],
    });
    return () => controls.stop();
  }, [target, duration, e0, e1, e2, e3, mv]);

  return mv;
}

/** Tween a `number` toward `target`, mirrored to React state. Discrete changes tween; drags snap. */
export function useSpringNumber(
  target: number,
  opts: SpringNumberOptions,
): number {
  const mv = useSpringMotionValue(target, opts);
  const [value, setValue] = useState(target);
  useMotionValueEvent(mv, "change", setValue);
  return value;
}
