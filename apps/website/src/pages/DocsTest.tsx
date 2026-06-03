import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PaperCard } from "../components/docs/PaperCard.tsx";
import { MarkUnderline } from "../components/docs/MarkUnderline.tsx";
import { SQUIGGLES, nextSquiggle } from "../components/docs/squiggles.ts";

const BROWN = "#73574a";
// No "Letters Home" webfont is installed; fall back to a system handwriting face
// (Bradley Hand on macOS) so the quote still reads as ink on paper.
const HAND = '"Letters Home", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';

const MARK_TYPES = ["Highlight", "Underline", "Overline", "Strike"] as const;
type MarkType = (typeof MARK_TYPES)[number];

// Slot the underline sits in. Taller than the design's marker so the fatter ink keeps the
// stroke's two passes visually distinct (the SVG stretches to fill it).
const UNDERLINE_W = 65.542;
const UNDERLINE_H = 9;

export function DocsTest() {
  const [active, setActive] = useState<MarkType>("Highlight");
  // A fresh squiggle from the bag on each selection, so the underline looks hand-drawn.
  const [squiggle, setSquiggle] = useState(nextSquiggle);
  const select = (type: MarkType) => {
    if (type === active) return; // already selected — don't redraw the squiggle
    setActive(type);
    setSquiggle(nextSquiggle());
  };

  return (
    <div className="flex w-full flex-col">
      <h3
        className="m-0"
        style={{ fontSize: 16, fontWeight: 500, color: BROWN, lineHeight: "24px", letterSpacing: "-0.25px" }}
      >
        markType
      </h3>
      <p
        className="m-0"
        style={{ fontSize: 14, fontWeight: 500, color: BROWN, lineHeight: "24px", letterSpacing: "-0.25px" }}
      >
        The kind of mark; a highlight band, an under/overline, or a strike-through.
      </p>

      <PaperCard className="mt-6">
        {/* Handwritten quote */}
        <div
          className="flex flex-1 flex-col items-center justify-center gap-[10px] px-6 text-center"
          style={{ minHeight: 197, color: BROWN }}
        >
          <div style={{ fontFamily: HAND, fontSize: 23, lineHeight: "40px" }}>
            <p className="m-0">{"“Data! Data! Data! "}</p>
            <p className="m-0">{"I can’t make bricks without clay.” "}</p>
          </div>
          <p className="m-0" style={{ fontFamily: HAND, fontSize: 16, lineHeight: "40px", opacity: 0.5 }}>
            - The Adventure of the Copper Beeches
          </p>
        </div>

        {/* Legend. The fold/crease is baked into the paper SVG. Each label is a button;
            selecting one fades the old underline out and draws a fresh random squiggle. */}
        <div role="tablist" aria-label="Mark type" className="flex items-center gap-5 px-5 py-5">
          {MARK_TYPES.map((type) => {
            const isActive = type === active;
            return (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => select(type)}
                className={`flex flex-1 flex-col items-center justify-center gap-[6px] border-0 bg-transparent p-0 pt-[3px] outline-none ${isActive ? "cursor-default" : "cursor-pointer"}`}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: BROWN,
                    letterSpacing: "-0.25px",
                    whiteSpace: "nowrap",
                    opacity: isActive ? 1 : 0.6,
                    transition: "opacity 150ms ease",
                  }}
                >
                  {type}
                </span>
                <div className="relative" style={{ height: UNDERLINE_H, width: UNDERLINE_W }}>
                  <AnimatePresence>
                    {isActive && (
                      // The new stroke scribbles itself on along the path (MarkUnderline's
                      // own draw); the old one just fades out as it does.
                      <motion.div
                        key={type}
                        className="absolute inset-0"
                        initial={false}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                      >
                        <MarkUnderline squiggle={SQUIGGLES[squiggle]} color={BROWN} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </button>
            );
          })}
        </div>
      </PaperCard>
    </div>
  );
}
