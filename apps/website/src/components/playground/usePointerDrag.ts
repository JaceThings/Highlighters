import { useRef, type RefObject } from "react";
import { animate, type MotionValue } from "framer-motion";
import {
  CLICK_THRESHOLD,
  PROP_CHANGE_DURATION,
  PROP_CHANGE_EASE,
  STEP_SNAP_DURATION,
  STEP_SNAP_EASE,
  clamp,
  prefersReducedMotion,
  snap,
} from "./slider-utils.ts";

interface UsePointerDragOptions {
  trackRef: RefObject<HTMLDivElement | null>;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Enforced lower bound. X still maps over the full min→max track, but the committed
   *  value can't drop below this — dragging into the floor region parks at the floor. */
  floor?: number;
  onChange: (next: number, fromDrag?: boolean) => void;
  reported: MotionValue<number>;
  /** Stops any in-flight prop-change tween before the pointer takes over.
   *  Owned by the parent so its prop-change effect stays the sole writer
   *  of that tween's ref. */
  stopPropAnim: () => void;
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
}: UsePointerDragOptions) {
  const lo = floor != null ? Math.max(min, floor) : min;
  const pointerIdRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  // Separate from the parent's prop-change tween ref: that effect's cleanup fires when
  // `value` updates from this same pointerdown, and wiping the tap-to-jump tween would
  // freeze the fill at its pre-tap position.
  const pointerAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  // Eases the fill into the freshly-stepped integer. Separate from the click-tween so a
  // mid-drag crossing can replace just the snap without killing the rest.
  const stepAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  // Last integer the drag committed to. null between drags so a fresh drag's first crossing
  // doesn't tick against a stale baseline.
  const lastDragSteppedRef = useRef<number | null>(null);
  // Tap vs drag: a pointerdown begins as a click; the first pointermove past CLICK_THRESHOLD
  // flips it to a drag. Until then the click-tween from pointerdown keeps playing.
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const isClickRef = useRef(true);

  // Committing a value rebuilds every quote overlay on the page; coalesce writes to one per
  // frame so a fast drag can't thrash all of them.
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
      // Non-null: onPointerDown always seeds lastDragSteppedRef before any drag.
      const prev = lastDragSteppedRef.current!;
      const stepsCrossed = Math.round(Math.abs(stepped - prev) / step);
      lastDragSteppedRef.current = stepped;

      if (stepAnimRef.current) stepAnimRef.current.stop();
      // Slow drag (one detent crossed): magnetic circOut snap. Fast drag
      // (multi-detent): hard set so the bar tracks the cursor instead of
      // trailing through an 80 ms tween it can't keep up with.
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

    // Tween toward the tapped position. If the user drags, onPointerMove cancels this and
    // switches to direct tracking; otherwise it plays out as a tap-to-jump. Seeding
    // lastDragSteppedRef here means the first crossing only ticks if it advances past the tap.
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
    if (targetValue !== value) onChange(targetValue, false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    if (pointerIdRef.current !== e.pointerId) return;
    if (isClickRef.current) {
      const downPos = pointerDownPosRef.current;
      if (!downPos) return;
      if (Math.abs(e.clientX - downPos.x) < CLICK_THRESHOLD) return;
      // Promote to a drag — kill the click-tween so `applyPointer` is the sole writer.
      if (pointerAnimRef.current) {
        pointerAnimRef.current.stop();
        pointerAnimRef.current = null;
      }
      isClickRef.current = false;
    }
    applyPointer(e.clientX);
  };

  // Capture-release, not pointerup: also covers the pointer leaving the element and OS
  // forced-release — the finger-flies-off-the-track case a pointerup handler misses.
  const onLostPointerCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    draggingRef.current = false;
    pointerIdRef.current = null;
    // Land the final value immediately (don't wait on the coalescing frame).
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (pendingRef.current !== null) {
      onChangeRef.current(pendingRef.current, true);
      pendingRef.current = null;
    }
    // After a real drag `reported` may hold a sub-step fraction; tween it to the stepped
    // value so signed sliders don't leave a sliver at the crossover. A click already
    // animated to the stepped target, so it needs no follow-up.
    if (!isClickRef.current) {
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
