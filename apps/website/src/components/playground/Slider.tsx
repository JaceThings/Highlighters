import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  animate,
  m,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "framer-motion";
import NumericText from "@numeric-text/react";
import { SmoothCorners } from "@lisse/react";
import {
  PROP_CHANGE_DURATION,
  PROP_CHANGE_EASE,
  READOUT_TRANSITION,
  clamp,
  lowerBound,
  prefersReducedMotion,
  reservedChars,
  snap,
} from "./slider-utils.ts";
import { useEditableValue } from "./useEditableValue.ts";
import { usePointerDrag } from "./usePointerDrag.ts";
import { feedSliderSound, primeMarkerAudio, stopSliderSound } from "../../lib/marker-audio.ts";

const TRACK_HEIGHT = 14;
const TRACK_SMOOTHING = 0.6;

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  description?: string;
  onChange: (next: number, fromDrag?: boolean) => void;
  floor?: number;
  format?: (value: number) => string;
  formatSeed?: (value: number) => string;
  formatSamples?: readonly number[];
  renderFill?: (ctx: { reported: MotionValue<number>; min: number; max: number; floor?: number }) => ReactNode;
  scrubSound?: boolean;
}

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
  scrubSound,
}: SliderProps) {
  const id = useId();
  const trackHeight = TRACK_HEIGHT;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const propAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const initialValueRef = useRef<number>(value);

  const safeRange = max - min === 0 ? 1 : max - min;
  const lo = lowerBound(min, floor);
  const readoutMinWidth = useMemo(
    () => `${reservedChars(min, max, step, format, formatSamples)}ch`,
    [min, max, step, format, formatSamples],
  );

  const reported = useMotionValue(value);

  const isSigned = min < 0 && max > 0;
  const toPercent = (v: number) => ((v - min) / safeRange) * 100;
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

  const scrubFeed = scrubSound ? feedSliderSound : undefined;
  const scrubPrime = scrubSound ? primeMarkerAudio : undefined;
  const scrubStop = scrubSound ? stopSliderSound : undefined;

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
    onScrub: scrubFeed,
    onScrubEnd: scrubStop,
  });

  useEffect(() => scrubStop, [scrubStop]);

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
    if (next !== value) {
      onChange(next, false);
      scrubFeed?.();
    }
  };

  const handleRangeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!e.shiftKey) return;
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1
              : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1
              : 0;
    if (dir === 0) return;
    e.preventDefault();
    const next = clamp(snap(value + dir * step * 10, step), lo, max);
    if (next !== value) {
      onChange(next, false);
      scrubFeed?.();
    }
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
      <div
        className="w-full touch-none select-none pt-2 pb-4 -mt-2 -mb-4"
        onPointerEnter={scrubPrime}
        onPointerDown={(e) => {
          scrubPrime?.();
          drag.onPointerDown(e);
        }}
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
              <div className="relative h-full w-full" style={{ overflow: "visible" }} aria-hidden>
                {renderFill({ reported, min, max, floor })}
              </div>
            ) : (
              <SmoothCorners
                asChild
                autoEffects={false}
                corners={{ radius: trackHeight / 2, smoothing: TRACK_SMOOTHING }}
              >
                <div
                  className="relative h-full w-full overflow-hidden bg-[rgba(126,117,108,0.12)]"
                  aria-hidden
                >
                  <m.div
                    className="absolute top-0 h-full bg-[#7e756c]"
                    style={{ left: fillLeft, width: fillWidth }}
                  />
                </div>
              </SmoothCorners>
            )}
          </div>
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
