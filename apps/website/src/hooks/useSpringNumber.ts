import { useEffect, useRef, useState } from "react";
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion";
import { prefersReducedMotion } from "../components/playground/slider-utils.ts";

export { prefersReducedMotion };

export interface SpringNumberOptions {
  duration: number;
  ease: [number, number, number, number];
  fromDrag?: boolean;
}

export function useSpringMotionValue(
  target: number,
  { duration, ease, fromDrag = false }: SpringNumberOptions,
): MotionValue<number> {
  const mv = useMotionValue(target);
  const fromDragRef = useRef(fromDrag);
  fromDragRef.current = fromDrag;

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

export function useSpringNumber(
  target: number,
  opts: SpringNumberOptions,
): number {
  const mv = useSpringMotionValue(target, opts);
  const [value, setValue] = useState(target);
  useMotionValueEvent(mv, "change", setValue);
  return value;
}
