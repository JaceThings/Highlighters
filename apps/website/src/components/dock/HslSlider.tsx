import { useRef } from "react";
import {
  TRACK_H,
  capsuleMask,
  clamp,
  knobLeftPercent,
  useCapsuleDrag,
  CapsuleKnob,
} from "./capsuleSlider.tsx";

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
  gradient: string;
  knobColor: string;
  onChange: (next: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useCapsuleDrag({ trackRef, value, min, max, onChange });

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const s = e.shiftKey ? step * 10 : step;
    drag.glideTo(clamp(value + dir * s, min, max));
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
      data-focus-radius="full"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.endDrag}
      onLostPointerCapture={drag.endDrag}
      onKeyDown={onKeyDown}
      className="relative w-full shrink-0 cursor-pointer touch-none select-none"
      style={{ height: TRACK_H }}
    >
      <div aria-hidden className="absolute inset-0" style={{ ...capsuleMask, background: gradient }} />
      <CapsuleKnob left={knobLeftPercent(value, min, max)} color={knobColor} />
    </div>
  );
}
