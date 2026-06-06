import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import { hexToOklch, mixOklch, oklchToRgb, type Oklch } from "../components/dock/oklch.ts";
import { prefersReducedMotion, type SpringNumberOptions } from "./useSpringNumber.ts";

// OKLCH mix with a midpoint chroma dip scaled to hue distance, so a wide opposite-hue swap
// doesn't cross a vivid false mid-hue. Dip lives here, not in mixOklch, to keep one-off mixes saturated.
function morph(a: Oklch, b: Oklch, t: number): Oklch {
  const c = mixOklch(a, b, t);
  const dH = Math.abs(((b.H - a.H + 540) % 360) - 180);
  return { ...c, C: c.C * (1 - 0.5 * (dH / 180) * Math.sin(Math.PI * t)) };
}

/** Tween an ink colour toward `targetHex` in OKLCH, returned as an `rgb()` string. Drags and reduced-motion snap. */
export function useAnimatedColor(
  targetHex: string,
  { duration, ease, fromDrag = false }: SpringNumberOptions,
): string {
  const target = hexToOklch(targetHex);
  const t = useMotionValue(1);
  const fromRef = useRef<Oklch>(target);
  const toRef = useRef<Oklch>(target);
  const first = useRef(true);
  const [value, setValue] = useState(() => oklchToRgb(target));

  useMotionValueEvent(t, "change", (p) =>
    setValue(oklchToRgb(morph(fromRef.current, toRef.current, p))),
  );

  const fromDragRef = useRef(fromDrag);
  fromDragRef.current = fromDrag;

  // Destructure so a fresh ease literal each render doesn't restart the tween.
  const [e0, e1, e2, e3] = ease;
  const key = `${target.L.toFixed(4)},${target.C.toFixed(4)},${target.H.toFixed(2)}`;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Restart from wherever the last tween reached, toward the new target.
    fromRef.current = morph(fromRef.current, toRef.current, t.get());
    toRef.current = target;
    if (fromDragRef.current || prefersReducedMotion()) {
      setValue(oklchToRgb(target));
      return;
    }
    t.set(0);
    const controls = animate(t, 1, { type: "tween", duration, ease: [e0, e1, e2, e3] });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `target`/`t` are tracked via `key`.
  }, [key, duration, e0, e1, e2, e3]);

  return value;
}
