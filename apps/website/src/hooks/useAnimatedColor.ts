import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import { hexToOklch, oklchToRgb, type Oklch } from "../components/dock/oklch.ts";
import type { SpringNumberOptions } from "./useSpringNumber.ts";

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function lerpOklch(a: Oklch, b: Oklch, t: number): Oklch {
  // Shortest signed hue delta, so a morph never takes the long way round the wheel.
  const dH = ((b.H - a.H + 540) % 360) - 180;
  // Wide opposite-hue swaps cross a vivid "false" mid-hue (yellow->blue through green);
  // dip chroma at the midpoint in proportion to the hue distance to soften it to a muted
  // sweep. Narrow swaps barely dip, and the endpoints are exact (sin(0) = sin(pi) = 0).
  const dip = 1 - 0.5 * (Math.abs(dH) / 180) * Math.sin(Math.PI * t);
  return {
    L: a.L + (b.L - a.L) * t,
    C: (a.C + (b.C - a.C) * t) * dip,
    H: a.H + dH * t,
  };
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
    setValue(oklchToRgb(lerpOklch(fromRef.current, toRef.current, p))),
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
    fromRef.current = lerpOklch(fromRef.current, toRef.current, t.get());
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
