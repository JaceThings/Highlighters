import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { MarkUnderline } from "./MarkUnderline.tsx";
import { SQUIGGLES, nextSquiggle } from "./squiggles.ts";
import { playZigZagSound, primeMarkerAudio } from "../../lib/marker-audio.ts";

// A row of labels where the active one is underlined by a hand-drawn marker scribble (fresh per
// selection). Keyboard: a Tab-focused option previews its underline at half opacity; Enter draws it solid.
const INK = "#73574a";
const UNDERLINE_W = 65.542;
const UNDERLINE_H = 9;

export function ScribbleLegend({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [squiggle, setSquiggle] = useState(nextSquiggle);
  const [focused, setFocused] = useState<string | null>(null);

  const select = (next: string) => {
    if (next === value) return;
    onChange(next);
    setSquiggle(nextSquiggle());
    playZigZagSound();
  };

  // Padding sizes this row to ~75px, matching the slider/swatch controls so the quote area is the same height on every card.
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex items-center gap-3 px-4 py-5" onPointerEnter={primeMarkerAudio}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        const isPreview = focused === opt.value && !isActive;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(opt.value)}
            // Preview only on keyboard focus: :focus-visible is the browser's pointer-vs-keyboard heuristic, so a click never flashes it.
            onFocus={(e) => {
              if (e.currentTarget.matches(":focus-visible")) setFocused(opt.value);
            }}
            onBlur={() => setFocused((f) => (f === opt.value ? null : f))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select(opt.value);
              }
            }}
            className={`flex flex-1 flex-col items-center justify-center gap-[6px] border-0 bg-transparent p-0 pt-[3px] outline-none ${isActive ? "cursor-default" : "cursor-pointer"}`}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: INK,
                letterSpacing: "-0.25px",
                whiteSpace: "nowrap",
                opacity: isActive ? 1 : isPreview ? 0.85 : 0.6,
                transition: "opacity 150ms ease",
              }}
            >
              {opt.label}
            </span>
            <div className="relative" style={{ height: UNDERLINE_H, width: UNDERLINE_W }}>
              <AnimatePresence>
                {(isActive || isPreview) && (
                  <m.div
                    key={opt.value}
                    className="absolute inset-0"
                    initial={isActive ? false : { opacity: 0 }}
                    animate={{ opacity: isActive ? 1 : 0.5 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                  >
                    <MarkUnderline
                      squiggle={SQUIGGLES[squiggle]}
                      color={INK}
                      opacity={1}
                      animate={isActive}
                    />
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </button>
        );
      })}
    </div>
  );
}
