import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import maskUrl from "./slider-mask.svg";

// 1:1 with slider-mask.svg's 284×43 viewBox; shared with OpacitySlider. The knob
// centre travels between the two cap centres so the round knob never clips a corner.
const TRACK_W = 284;
const TRACK_H = 43;
const KNOB = 39;
const TRAVEL_MIN = TRACK_H / 2;
const TRAVEL_MAX = TRACK_W - TRACK_H / 2;

const GLIDE_MS = 280;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

// Clip the channel ramp to the capsule with a single-path mask, so no cap/middle seam.
const capsuleMask = {
  maskImage: `url("${maskUrl}")`,
  WebkitMaskImage: `url("${maskUrl}")`,
  maskSize: "100% 100%",
  WebkitMaskSize: "100% 100%",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
};

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/** One HSL channel: a gradient ramp clipped to the capsule with a draggable knob.
 *  A tap glides the value (and the knob) to the target; a drag follows the pointer
 *  directly; arrows nudge by `step`. The knob is filled with the current colour. */
export function HslSlider({
  label,
  value,
  min,
  max,
  step,
  gradient,
  knobColor,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** CSS background painting the channel across the track, left = min, right = max. */
  gradient: string;
  /** The picked colour, shown inside the knob's white ring. */
  knobColor: string;
  onChange: (next: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const draggingRef = useRef(false);
  const downXRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const t = (value - min) / (max - min);
  const knobCenter = TRAVEL_MIN + clamp(t, 0, 1) * (TRAVEL_MAX - TRAVEL_MIN);

  // Map client x onto [min, max] across the knob's travel (not the raw track).
  const valueFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const { left, width } = track.getBoundingClientRect();
    const x = ((clientX - left) / width) * TRACK_W;
    const norm = clamp((x - TRAVEL_MIN) / (TRAVEL_MAX - TRAVEL_MIN), 0, 1);
    return min + norm * (max - min);
  };

  // Ease the value from where it is to `target`, so the knob and colour glide on a tap.
  // A drag clears draggingRef's guard and the loop bails to follow the pointer instead.
  const glideTo = (target: number) => {
    cancelAnimationFrame(rafRef.current);
    const from = value;
    const t0 = performance.now();
    const tick = (now: number) => {
      if (draggingRef.current) return;
      const p = Math.min(1, (now - t0) / GLIDE_MS);
      onChange(from + (target - from) * easeOut(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = false;
    downXRef.current = e.clientX;
    glideTo(valueFromClientX(e.clientX));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    // A few px of travel promotes the gesture from tap to drag: stop the glide, follow live.
    if (!draggingRef.current && Math.abs(e.clientX - downXRef.current) < 4) return;
    draggingRef.current = true;
    cancelAnimationFrame(rafRef.current);
    onChange(valueFromClientX(e.clientX));
  };
  const endDrag = () => {
    draggingRef.current = false;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    onChange(clamp(value + dir * step, min, max));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      data-focus-ring
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
      className="relative w-full shrink-0 cursor-pointer touch-none select-none"
      style={{ height: TRACK_H }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ ...capsuleMask, background: gradient }}
      />
      {/* Knob, above the mask so its white ring stays crisp at the extremes. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 rounded-full border-[3.5px] border-white"
        style={{
          width: KNOB,
          height: KNOB,
          left: `${(knobCenter / TRACK_W) * 100}%`,
          transform: "translate(-50%, -50%)",
          background: knobColor,
          filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.3))",
        }}
      />
    </div>
  );
}
