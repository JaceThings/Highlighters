import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MarkUnderline } from "./MarkUnderline.tsx";
import { SQUIGGLES, nextSquiggle } from "./squiggles.ts";

// A row of selectable labels where the active one is underlined by a hand-drawn marker
// scribble (a fresh random one per selection). Sits in the lower quarter of a PaperCard, on
// the fold. Clicking the active label is a no-op so it doesn't pointlessly redraw.

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
  const select = (next: string) => {
    if (next === value) return;
    onChange(next);
    setSquiggle(nextSquiggle());
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex items-center gap-3 px-4 py-5">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(opt.value)}
            className={`flex flex-1 flex-col items-center justify-center gap-[6px] border-0 bg-transparent p-0 pt-[3px] outline-none ${isActive ? "cursor-default" : "cursor-pointer"}`}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: INK,
                letterSpacing: "-0.25px",
                whiteSpace: "nowrap",
                opacity: isActive ? 1 : 0.6,
                transition: "opacity 150ms ease",
              }}
            >
              {opt.label}
            </span>
            <div className="relative" style={{ height: UNDERLINE_H, width: UNDERLINE_W }}>
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    key={opt.value}
                    className="absolute inset-0"
                    initial={false}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                  >
                    <MarkUnderline squiggle={SQUIGGLES[squiggle]} color={INK} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </button>
        );
      })}
    </div>
  );
}
