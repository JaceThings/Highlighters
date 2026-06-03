import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "framer-motion";
import NumericText from "@numeric-text/react";
import { SmoothCorners } from "@lisse/react";
import { usePlaygroundTuning } from "./PlaygroundTuning.tsx";
import {
  PROP_CHANGE_DURATION,
  PROP_CHANGE_EASE,
  READOUT_TRANSITION,
  clamp,
  prefersReducedMotion,
  reservedChars,
  snap,
} from "./slider-utils.ts";
import { useEditableValue } from "./useEditableValue.ts";
import { usePointerDrag } from "./usePointerDrag.ts";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Optional muted caption rendered directly under the track row. Zero
   *  layout impact when absent. */
  description?: string;
  /** `fromDrag` is true only for continuous pointer-drag updates. Tap-to-jump,
   *  keyboard, double-click revert, and typed input all report `false` so the
   *  consumer animates the value change. */
  onChange: (next: number, fromDrag?: boolean) => void;
  /** Enforced minimum: the value can't drop below it. The track still spans min→max, so a
   *  custom fill can mark the 0→floor region. */
  floor?: number;
  /** Optional display formatter — e.g. `(v) => v.toFixed(2)` for smoothing. */
  format?: (value: number) => string;
  /** Optional seed formatter for the editable input. Used when `format`
   *  produces a decorated string the input shouldn't seed with (e.g. an
   *  "iOS – 0.60" annotation). Falls back to `format`. */
  formatSeed?: (value: number) => string;
  /** Extra values fed through `format` when computing the readout's
   *  reserved column width, so special-case formatted strings (wider than
   *  the endpoints) still fit without reflow. */
  formatSamples?: readonly number[];
  /** Replace the default solid fill with custom content (e.g. a hand-drawn
   *  scribble), painted inside the rounded track. Receives the live `reported`
   *  motion value so it can reveal itself by the slider fraction. */
  renderFill?: (ctx: { reported: MotionValue<number>; min: number; max: number; floor?: number }) => ReactNode;
}

// Isolates the per-frame readout state so digit morphing re-renders only this node, not the
// whole Slider (and its scribble-fill subtree).
function Readout({ displayed }: { displayed: MotionValue<string> }) {
  const [text, setText] = useState(() => displayed.get());
  useMotionValueEvent(displayed, "change", setText);
  return <NumericText value={text} transition={READOUT_TRANSITION} />;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  floor,
  onChange,
  format,
  formatSeed,
  formatSamples,
  description,
  renderFill,
}: SliderProps) {
  const id = useId();
  const tuning = usePlaygroundTuning();
  const trackHeight = tuning.trackHeight;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const propAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  // Captured once on mount — double-click on the label reverts to this.
  // Subsequent prop updates (presets, drags) don't touch the ref.
  const initialValueRef = useRef<number>(value);

  const safeRange = max - min === 0 ? 1 : max - min;
  // Enforced lower bound: the track still spans min→max, but committed values clamp to `lo`.
  const lo = floor != null ? Math.max(min, floor) : min;
  // Memoised so `reservedChars` (which calls `format()`) doesn't rerun on every drag tick.
  const readoutMinWidth = useMemo(
    () => `${reservedChars(min, max, step, format, formatSamples)}ch`,
    [min, max, step, format, formatSamples],
  );

  const reported = useMotionValue(value);

  // Signed ranges (min < 0 < max) anchor the fill chunk at zero and grow outward;
  // unsigned ranges stay left-anchored.
  const isSigned = min < 0 && max > 0;
  const toPercent = (v: number) => ((v - min) / safeRange) * 100;
  // Treat the ±step/2 band around zero as exactly zero so a sub-step `reported` value
  // doesn't paint a sliver while the readout already shows "0".
  const fillLeft = useTransform(reported, (v) => {
    const clamped = clamp(v, min, max);
    if (isSigned && Math.abs(clamped) < step / 2) {
      return `${toPercent(0)}%`;
    }
    const leftEdge = isSigned ? Math.min(0, clamped) : min;
    return `${toPercent(leftEdge)}%`;
  });
  const fillWidth = useTransform(reported, (v) => {
    const clamped = clamp(v, min, max);
    if (isSigned && Math.abs(clamped) < step / 2) return "0%";
    const leftEdge = isSigned ? Math.min(0, clamped) : min;
    const rightEdge = isSigned ? Math.max(0, clamped) : clamped;
    return `${((rightEdge - leftEdge) / safeRange) * 100}%`;
  });

  const displayed = useTransform(reported, (v) => {
    const stepped = clamp(snap(v, step), lo, max);
    return format ? format(stepped) : String(stepped);
  });

  const drag = usePointerDrag({
    trackRef,
    value,
    min,
    max,
    step,
    floor,
    onChange,
    reported,
    stopPropAnim: () => {
      if (propAnimRef.current) {
        propAnimRef.current.stop();
        propAnimRef.current = null;
      }
    },
  });

  // Tween `reported` toward the controlled prop on non-drag changes (preset, keyboard).
  // During a drag the drag is the source of truth — skip the tween.
  useEffect(() => {
    if (drag.isDraggingRef.current) return;
    if (propAnimRef.current) propAnimRef.current.stop();
    if (prefersReducedMotion()) {
      reported.set(value);
      return;
    }
    propAnimRef.current = animate(reported, value, {
      type: "tween",
      duration: PROP_CHANGE_DURATION,
      ease: PROP_CHANGE_EASE,
    });
    return () => {
      propAnimRef.current?.stop();
      propAnimRef.current = null;
    };
  }, [value, reported, drag.isDraggingRef]);

  const handleKeyboardInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (drag.isDraggingRef.current) return;
    const next = clamp(Number(e.currentTarget.value), lo, max);
    if (next !== value) onChange(next, false);
  };

  // Shift + Arrow on the hidden native range jumps 10×step. Plain arrows
  // fall through to the browser's default ±step behaviour.
  const handleRangeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!e.shiftKey) return;
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1
              : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1
              : 0;
    if (dir === 0) return;
    e.preventDefault();
    const next = clamp(snap(value + dir * step * 10, step), lo, max);
    if (next !== value) onChange(next, false);
  };

  const handleLabelDoubleClick = () => {
    const revert = clamp(initialValueRef.current, lo, max);
    if (revert !== value) onChange(revert, false);
  };

  const editable = useEditableValue({ value, min: lo, max, step, format, formatSeed, onChange });

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-center justify-between px-[2px] text-[14px] leading-[1.2] font-medium tracking-[-0.25px]">
        <label
          htmlFor={id}
          onDoubleClick={handleLabelDoubleClick}
          className="flex-1 min-w-0 select-none text-text-input"
        >
          <NumericText value={label} transition={READOUT_TRANSITION} />
        </label>
        {editable.editing ? (
          <input
            ref={editable.inputRef}
            type="text"
            inputMode="decimal"
            value={editable.draft}
            onChange={(e) => editable.setDraft(e.currentTarget.value)}
            onKeyDown={editable.handleInputKeyDown}
            onBlur={editable.commitEdit}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="playground-slider-input shrink-0 text-right text-text-input"
            style={{ minWidth: readoutMinWidth }}
          />
        ) : (
          <span
            onClick={editable.beginEdit}
            className="playground-slider-value inline-flex shrink-0 select-none justify-end whitespace-nowrap text-[rgba(126,117,108,0.5)]"
            style={{ minWidth: readoutMinWidth }}
          >
            <Readout displayed={displayed} />
          </span>
        )}
      </div>
      {/* Hit-area band. `-mt-2` cancels the `gap-2` above and `pt-2` reclaims it as a top
          hit extension into the gap, so the target reaches ~32px without overlapping the
          label's double-click area. */}
      <div
        className="w-full touch-none select-none pt-2 pb-4 -mt-2 -mb-4"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onLostPointerCapture={drag.onLostPointerCapture}
      >
        <div
          ref={trackRef}
          className="relative w-full"
          style={{ height: trackHeight }}
        >
          <div className="absolute inset-0 h-full w-full">
            {renderFill ? (
              // A custom fill owns the whole track; `overflow: visible` lets a warped edge bleed.
              <div className="relative h-full w-full" style={{ overflow: "visible" }} aria-hidden>
                {renderFill({ reported, min, max, floor })}
              </div>
            ) : (
              <SmoothCorners
                asChild
                autoEffects={false}
                corners={{ radius: trackHeight / 2, smoothing: tuning.trackSmoothing }}
              >
                <div
                  className="relative h-full w-full overflow-hidden bg-[rgba(126,117,108,0.12)]"
                  aria-hidden
                >
                  <motion.div
                    className="absolute top-0 h-full bg-[#7e756c]"
                    style={{ left: fillLeft, width: fillWidth }}
                  />
                </div>
              </SmoothCorners>
            )}
          </div>
          {/* Hidden native range = the keyboard + screen-reader path. Pointer events are
              disabled so it never steals drags; it stays focusable via Tab for arrow input. */}
          <input
            id={id}
            type="range"
            min={lo}
            max={max}
            step={step}
            value={value}
            onChange={handleKeyboardInput}
            onKeyDown={handleRangeKeyDown}
            data-focus-ring
            className="playground-slider absolute inset-0 h-full w-full pointer-events-none appearance-none bg-transparent"
          />
        </div>
      </div>
      {description ? (
        <p className="select-none px-[2px] text-[12px] leading-[1.35] font-medium tracking-[-0.1px] text-text-secondary text-wrap-pretty">
          {description}
        </p>
      ) : null}
    </div>
  );
}
