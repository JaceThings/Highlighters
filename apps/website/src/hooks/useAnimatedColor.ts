import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import { hexToOklch, mixOklch, oklchToRgb, type Oklch } from "../components/dock/oklch.ts";
import type { SpringNumberOptions } from "./useSpringNumber.ts";

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// The shared OKLCH mix, plus a transition-only easing of the vivid "false" mid-hue a wide
// opposite-hue swap crosses (yellow->blue through green): dip chroma at the midpoint in
// proportion to the hue distance. Narrow swaps barely dip; endpoints are exact (sin0=sinπ=0).
// The dip lives here, not in mixOklch, so a one-off mix stays fully saturated.
function morph(a: Oklch, b: Oklch, t: number): Oklch {
  const c = mixOklch(a, b, t);
  const dH = Math.abs(((b.H - a.H + 540) % 360) - 180);
  c.C *= 1 - 0.5 * (dH / 180) * Math.sin(Math.PI * t);
  return c;
}

/**
 * Tween an ink colour toward `targetHex` and return the current colour as an `rgb()`
 * string. Interpolating in OKLCH (not sRGB) keeps chroma up so a swap glides through
 * a saturated hue instead of dipping toward grey; the renderer recolours the mark in
 * place each frame, so this reads like the dock's smooth tip colour - no second copy,
 * no flash. Drags and reduced-motion snap straight to the target.
 */
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
    // First mount already shows the target; nothing to animate.
    if (first.current) {
      first.current = false;
      return;
    }
    // Restart from wherever the last tween had reached, toward the new target.
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
