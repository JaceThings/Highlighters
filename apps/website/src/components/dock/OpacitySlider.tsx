import { useRef } from "react";
import { hexToRgb } from "./oklch.ts";
import checkerUrl from "./checker.svg";
import {
  TRACK_H,
  capsuleMask,
  clamp,
  knobLeftPercent,
  useCapsuleDrag,
  CapsuleKnob,
} from "./capsuleSlider.tsx";

// SVG checkerboard (crisp at any DPR) avoids the diagonal seam a gradient checker leaves.
const CELL = TRACK_H / 3;
const checkerboard = {
  backgroundImage: `url("${checkerUrl}")`,
  backgroundSize: `${CELL * 2}px ${CELL * 2}px`,
  backgroundRepeat: "repeat",
};

/** Opacity slider: ink ramp over a transparency checker, clipped to the capsule. */
export function OpacitySlider({
  inkColor,
  value,
  onChange,
}: {
  inkColor: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useCapsuleDrag({ trackRef, value, min: 0, max: 1, onChange });
  const rgb = hexToRgb(inkColor);
  const pct = Math.round(value * 100);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    // Shift = 10% (coarse step), else 5%.
    const step = e.shiftKey ? 0.1 : 0.05;
    drag.glideTo(clamp(value + dir * step, 0, 1));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Opacity"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%`}
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
      <div aria-hidden className="absolute inset-0" style={{ ...capsuleMask, ...checkerboard }}>
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `linear-gradient(to right, rgba(${rgb}, 0), rgba(${rgb}, 1))` }}
        />
      </div>
      <CapsuleKnob left={knobLeftPercent(value, 0, 1)} />
    </div>
  );
}
