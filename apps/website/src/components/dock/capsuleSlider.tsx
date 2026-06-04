import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import maskUrl from "./slider-mask.svg";

// Shared primitives for the dock's capsule sliders (opacity + HSL channels). 1:1 with
// slider-mask.svg's 284×43 viewBox; the knob centre travels between the two cap centres so
// the round knob never clips a corner.
const TRACK_W = 284;
export const TRACK_H = 43;
const KNOB = 39;
const TRAVEL_MIN = TRACK_H / 2;
const TRAVEL_MAX = TRACK_W - TRACK_H / 2;

const GLIDE_MS = 280;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

// Clip a channel ramp to the capsule with a single-path mask, so no cap/middle seam.
export const capsuleMask = {
  maskImage: `url("${maskUrl}")`,
  WebkitMaskImage: `url("${maskUrl}")`,
  maskSize: "100% 100%",
  WebkitMaskSize: "100% 100%",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
};

/** The knob centre as a left % for `value`, kept within the cap-to-cap travel. */
export function knobLeftPercent(value: number, min: number, max: number): string {
  const t = max - min === 0 ? 0 : (value - min) / (max - min);
  const center = TRAVEL_MIN + clamp(t, 0, 1) * (TRAVEL_MAX - TRAVEL_MIN);
  return `${(center / TRACK_W) * 100}%`;
}

/** The white-ring knob, above the mask so its ring stays crisp at the extremes. `color`
 *  fills the centre (the HSL pick); omit it for a hollow ring (opacity). */
export function CapsuleKnob({ left, color }: { left: string; color?: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-1/2 rounded-full border-[3.5px] border-white"
      style={{
        width: KNOB,
        height: KNOB,
        left,
        transform: "translate(-50%, -50%)",
        background: color,
        filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.3))",
      }}
    />
  );
}

/** Pointer behaviour for a capsule slider: a tap glides the value (and knob) to the target
 *  over GLIDE_MS; the first few px of travel promotes the gesture to a drag that tracks the
 *  pointer directly. X always maps across the full min→max track. */
export function useCapsuleDrag({
  trackRef,
  value,
  min,
  max,
  onChange,
}: {
  trackRef: RefObject<HTMLDivElement | null>;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const rafRef = useRef(0);
  const draggingRef = useRef(false);
  const downXRef = useRef(0);
  // Read the latest onChange inside the rAF glide, in case the parent re-renders mid-animation.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const valueFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const { left, width } = track.getBoundingClientRect();
    const x = ((clientX - left) / width) * TRACK_W;
    const norm = clamp((x - TRAVEL_MIN) / (TRAVEL_MAX - TRAVEL_MIN), 0, 1);
    return min + norm * (max - min);
  };

  const glideTo = (target: number) => {
    cancelAnimationFrame(rafRef.current);
    const from = value;
    const t0 = performance.now();
    const tick = (now: number) => {
      if (draggingRef.current) return;
      const p = Math.min(1, (now - t0) / GLIDE_MS);
      onChangeRef.current(from + (target - from) * easeOut(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  return {
    // Glide the value (and knob) to a target over GLIDE_MS, e.g. for keyboard nudges so
    // arrow/shift steps ease across instead of snapping.
    glideTo,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = false;
      downXRef.current = e.clientX;
      glideTo(valueFromClientX(e.clientX));
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      if (!draggingRef.current && Math.abs(e.clientX - downXRef.current) < 4) return;
      draggingRef.current = true;
      cancelAnimationFrame(rafRef.current);
      onChangeRef.current(valueFromClientX(e.clientX));
    },
    endDrag: () => {
      draggingRef.current = false;
    },
  };
}
