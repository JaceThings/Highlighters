import { useCallback, useEffect, type RefObject } from "react";
import type { MotionValue } from "framer-motion";

// Apply MotionValues to a plain DOM node by subscribing and writing on change. The dock's geometry
// is driven this way (not via `m`-component style props) because framer reads the element's computed
// value back into externally-created MotionValues when its VisualElement initializes, which would
// clobber the values we set imperatively. Plain nodes sidestep that entirely.
export function useBindMotion(
  ref: RefObject<HTMLElement | SVGElement | null>,
  values: MotionValue<number>[],
  apply: (el: HTMLElement | SVGElement) => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Apply synchronously on mount so the first paint is correct (no one-frame gap before the
    // first scheduled flush).
    apply(el);
    // Coalesce writes: when several subscribed values change in the same frame (e.g. a binding over
    // [x, y, width, height] during a morph), mark the binding dirty and run a single rAF-batched
    // `apply` instead of one `apply` per value per frame (which previously wrote 4x/frame). This is
    // visually identical - just fewer redundant DOM writes per frame.
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
    // `values` are stable MotionValue instances; `apply` is provided stable by callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, apply]);
}

// Drive an element's opacity from a single MotionValue. The common case of useBindMotion.
export function useOpacityBind(
  ref: RefObject<HTMLElement | SVGElement | null>,
  value: MotionValue<number>,
) {
  const apply = useCallback((el: HTMLElement | SVGElement) => {
    el.style.opacity = String(value.get());
  }, [value]);
  useBindMotion(ref, [value], apply);
}
