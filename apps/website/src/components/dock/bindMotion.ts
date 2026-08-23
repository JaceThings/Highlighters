import { useCallback, useEffect, type RefObject } from "react";
import type { MotionValue } from "framer-motion";

export function useBindMotion(
  ref: RefObject<HTMLElement | SVGElement | null>,
  values: MotionValue<number>[],
  apply: (el: HTMLElement | SVGElement) => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    apply(el);
    let frame = 0;
    const flush = () => {
      frame = 0;
      apply(el);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(flush);
    };
    const unsubs = values.map((v) => v.on("change", schedule));
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      unsubs.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, apply]);
}

export function useOpacityBind(
  ref: RefObject<HTMLElement | SVGElement | null>,
  value: MotionValue<number>,
) {
  const apply = useCallback((el: HTMLElement | SVGElement) => {
    el.style.opacity = String(value.get());
  }, [value]);
  useBindMotion(ref, [value], apply);
}
