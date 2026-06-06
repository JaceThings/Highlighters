import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";

export interface SpringNumberOptions {
  duration: number;
  ease: [number, number, number, number];
  /** Drag-driven target: bypass the tween (input is already smooth; a tween on top would lag it). */
  fromDrag?: boolean;
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Tween a `number` toward `target`, mirrored to React state. Discrete changes tween; drags snap. */
export function useSpringNumber(
  target: number,
  { duration, ease, fromDrag = false }: SpringNumberOptions,
): number {
  const mv = useMotionValue(target);
  const [value, setValue] = useState(target);
  const fromDragRef = useRef(fromDrag);
  fromDragRef.current = fromDrag;

  useMotionValueEvent(mv, "change", setValue);

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

  return value;
}
