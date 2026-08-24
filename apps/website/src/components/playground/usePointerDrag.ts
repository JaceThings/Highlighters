import { useRef, type RefObject } from "react";
import { animate, type MotionValue } from "framer-motion";
import {
  CLICK_THRESHOLD,
  PROP_CHANGE_DURATION,
  PROP_CHANGE_EASE,
  STEP_SNAP_DURATION,
  STEP_SNAP_EASE,
  clamp,
  lowerBound,
  prefersReducedMotion,
  snap,
} from "./slider-utils.ts";

interface UsePointerDragOptions {
  trackRef: RefObject<HTMLDivElement | null>;
  value: number;
  min: number;
  max: number;
  step: number;
  floor?: number;
  onChange: (next: number, fromDrag?: boolean) => void;
  reported: MotionValue<number>;
  stopPropAnim: () => void;
  onScrub?: () => void;
  onScrubEnd?: () => void;
}

export function usePointerDrag({
  trackRef,
  value,
  min,
  max,
  step,
  floor,
  onChange,
  reported,
  stopPropAnim,
  onScrub,
  onScrubEnd,
}: UsePointerDragOptions) {
  const lo = lowerBound(min, floor);
  const pointerIdRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const pointerAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const stepAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const lastDragSteppedRef = useRef<number | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const isClickRef = useRef(true);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const flushDrag = () => {
    rafRef.current = 0;
    const v = pendingRef.current;
    pendingRef.current = null;
    if (v !== null) onChangeRef.current(v, true);
  };

  const range = max - min;

  const applyPointer = (cx: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return;

    const ratio = clamp((cx - rect.left) / rect.width, 0, 1);
    const raw = ratio * range + min;
    const stepped = clamp(snap(raw, step), lo, max);

    if (stepped !== lastDragSteppedRef.current) {
      const prev = lastDragSteppedRef.current!;
      const stepsCrossed = Math.round(Math.abs(stepped - prev) / step);
      lastDragSteppedRef.current = stepped;
      onScrub?.();

      if (stepAnimRef.current) stepAnimRef.current.stop();
      if (prefersReducedMotion() || stepsCrossed > 1) {
        reported.set(stepped);
      } else {
        stepAnimRef.current = animate(reported, stepped, {
          type: "tween",
          duration: STEP_SNAP_DURATION,
          ease: STEP_SNAP_EASE,
        });
      }
    }
    if (stepped !== value) {
      pendingRef.current = stepped;
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flushDrag);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return;
    e.preventDefault();
    stopPropAnim();
    if (pointerAnimRef.current) {
      pointerAnimRef.current.stop();
      pointerAnimRef.current = null;
    }
    if (stepAnimRef.current) {
      stepAnimRef.current.stop();
      stepAnimRef.current = null;
    }
    track.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    draggingRef.current = true;
    isClickRef.current = true;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };

    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const raw = ratio * range + min;
    const targetValue = clamp(snap(raw, step), lo, max);
    lastDragSteppedRef.current = targetValue;
    if (prefersReducedMotion()) {
      reported.set(targetValue);
    } else {
      pointerAnimRef.current = animate(reported, targetValue, {
        type: "tween",
        duration: PROP_CHANGE_DURATION,
        ease: PROP_CHANGE_EASE,
      });
    }
    if (targetValue !== value) {
      onChange(targetValue, false);
      onScrub?.();
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    if (pointerIdRef.current !== e.pointerId) return;
    if (isClickRef.current) {
      const downPos = pointerDownPosRef.current;
      if (!downPos) return;
      if (Math.abs(e.clientX - downPos.x) < CLICK_THRESHOLD) return;
      if (pointerAnimRef.current) {
        pointerAnimRef.current.stop();
        pointerAnimRef.current = null;
      }
      isClickRef.current = false;
    }
    applyPointer(e.clientX);
  };

  const onLostPointerCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    draggingRef.current = false;
    pointerIdRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (pendingRef.current !== null) {
      onChangeRef.current(pendingRef.current, true);
      pendingRef.current = null;
    }
    if (!isClickRef.current) {
      onScrubEnd?.();
      if (pointerAnimRef.current) {
        pointerAnimRef.current.stop();
        pointerAnimRef.current = null;
      }
      if (prefersReducedMotion()) {
        reported.set(value);
      } else {
        pointerAnimRef.current = animate(reported, value, {
          type: "tween",
          duration: PROP_CHANGE_DURATION,
          ease: PROP_CHANGE_EASE,
        });
      }
    }
    isClickRef.current = true;
    pointerDownPosRef.current = null;
    lastDragSteppedRef.current = null;
    if (stepAnimRef.current) {
      stepAnimRef.current.stop();
      stepAnimRef.current = null;
    }
  };

  return {
    isDraggingRef: draggingRef,
    onPointerDown,
    onPointerMove,
    onLostPointerCapture,
  };
}
