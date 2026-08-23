import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, type MotionValue } from "framer-motion";
import type { MarkType } from "@highlighters/core";
import { STATE_CHANGE_EASE } from "../components/playground/springs.ts";
import { prefersReducedMotion } from "./useSpringNumber.ts";

const FADE_OUT_MS = 150;
const FADE_OUT = { type: "tween" as const, duration: FADE_OUT_MS / 1000, ease: STATE_CHANGE_EASE };

export interface MarkTypeSwap {
  markType: MarkType;
  fade: MotionValue<number>;
  drawKey: number;
}

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
