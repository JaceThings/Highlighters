import { useState } from "react";
import { SmoothCorners } from "@lisse/react";
import type { ShadowConfig } from "@lisse/core";
import { Highlight } from "@highlighters/react";
import type { HighlightOptions, MarkType } from "@highlighters/core";
import { BASE_SELECTION_OPTIONS, penToTip, type PenTip } from "../../selection-style.tsx";
import { OpacitySlider } from "./OpacitySlider.tsx";

// A Lisse ShadowConfig so the lift traces the squircle (a CSS box-shadow would clip).
const POPOVER_SHADOW: ShadowConfig = {
  offsetX: 0, offsetY: 6, blur: 14, spread: -6, color: "#73574A", opacity: 0.15,
};

const MARK_OPTIONS: { type: MarkType; label: string }[] = [
  { type: "highlight", label: "Highlight" },
  { type: "strike-through", label: "Strike-through" },
  { type: "overline", label: "Overline" },
  { type: "underline", label: "Underline" },
];

// The previews are a type/shape picker, so they paint at a fixed, legible opacity
// (independent of the live ink opacity, which the slider owns) — like the swatches
// they replace, always clearly readable.
const PREVIEW_OPACITY = 0.9;

// A real (miniature) highlighter stroke for the option — same ink, opacity, nib and
// edges as the live marker, so it shows the actual chisel/bullet/flat shape and the
// band's true position for that mark type. Painted over transparent text so only the
// stroke shows; the cell clips any overshoot. The overlay is scoped to this span
// (host) so it renders INSIDE the popover — not on the body, where it would sit
// behind/below the panel.
function MarkPreview({ options }: { options: HighlightOptions }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <span ref={setHost} className="relative inline-flex items-center justify-center" aria-hidden>
      {host && (
        <Highlight
          as="span"
          host={host}
          options={options}
          className="select-none text-[15px] font-semibold leading-[22px] tracking-[1px]"
          style={{ color: "transparent" }}
        >
          Aa
        </Highlight>
      )}
    </span>
  );
}

/** The settings panel above the active pen: a mark-type row + opacity slider, both
 *  driving the shared selection style. Lisse squircle container. */
export function MarkerPopover({
  inkColor,
  pen,
  opacity,
  markType,
  onOpacity,
  onMarkType,
}: {
  inkColor: string;
  pen: PenTip;
  opacity: number;
  markType: MarkType;
  onOpacity: (next: number) => void;
  onMarkType: (next: MarkType) => void;
}) {
  // The active pen's nib, with a tighter overshoot so the small stroke and its end
  // caps sit inside the cell.
  const tip = { ...penToTip(pen).tip, overshoot: 4, overshootJitter: 0 };

  return (
    <SmoothCorners
      asChild
      autoEffects={false}
      corners={{ radius: 41, smoothing: 0.6 }}
      shadow={POPOVER_SHADOW}
    >
      <div
        role="group"
        aria-label="Marker settings"
        className="flex w-[320px] flex-col items-center gap-[18px] bg-white p-[18px]"
      >
        <div className="flex w-full items-stretch justify-between">
          {MARK_OPTIONS.map((m, i) => {
            const selected = m.type === markType;
            const options: HighlightOptions = {
              ...BASE_SELECTION_OPTIONS,
              color: inkColor,
              opacity: PREVIEW_OPACITY,
              markType: m.type,
              tip,
              seed: 11 * (i + 1), // stable, distinct edge jitter per cell
              animation: { draw: false }, // static preview — no draw-on each open
            };
            return (
              <button
                key={m.type}
                type="button"
                aria-label={m.label}
                aria-pressed={selected}
                onClick={() => onMarkType(m.type)}
                data-focus-ring
                className={`group flex h-[44px] flex-1 items-center justify-center overflow-hidden rounded-[12px] transition-colors duration-200 ${selected ? "bg-[#efeeed]" : "bg-transparent"}`}
              >
                <span className="transition-transform duration-150 group-active:scale-[0.96]">
                  <MarkPreview options={options} />
                </span>
              </button>
            );
          })}
        </div>
        <OpacitySlider inkColor={inkColor} value={opacity} onChange={onOpacity} />
      </div>
    </SmoothCorners>
  );
}
