import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import maskUrl from "./slider-mask.svg";

// 1:1 with slider-mask.svg's 284×43 viewBox; shared with OpacitySlider. The knob
// centre travels between the two cap centres so the round knob never clips a corner.
const TRACK_W = 284;
const TRACK_H = 43;
const KNOB = 39;
const TRAVEL_MIN = TRACK_H / 2;
const TRAVEL_MAX = TRACK_W - TRACK_H / 2;

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
 *  Drag / tap sets a value in [min, max]; arrows nudge by `step`. */
export function HslSlider({
  label,
  value,
  min,
  max,
  step,
  gradient,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** CSS background painting the channel across the track, left = min, right = max. */
  gradient: string;
  onChange: (next: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const t = (value - min) / (max - min);
  const knobCenter = TRAVEL_MIN + clamp(t, 0, 1) * (TRAVEL_MAX - TRAVEL_MIN);

  // Map client x onto [min, max] across the knob's travel (not the raw track).
  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const { left, width } = track.getBoundingClientRect();
    const x = ((clientX - left) / width) * TRACK_W;
    const norm = clamp((x - TRAVEL_MIN) / (TRAVEL_MAX - TRAVEL_MIN), 0, 1);
    onChange(min + norm * (max - min));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromClientX(e.clientX);
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
          filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.3))",
        }}
      />
    </div>
  );
}
