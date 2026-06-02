import { SmoothCorners } from "@lisse/react";
import type { ShadowConfig } from "@lisse/core";
import type { MarkType } from "@highlighters/core";
import { hexToRgb } from "./oklch.ts";
import { OpacitySlider } from "./OpacitySlider.tsx";

// A Lisse ShadowConfig so the lift traces the squircle (a CSS box-shadow would clip).
const POPOVER_SHADOW: ShadowConfig = {
  offsetX: 0, offsetY: 6, blur: 14, spread: -6, color: "#73574A", opacity: 0.15,
};

// Each option's swatch sits at a height/position that previews its mark kind.
type Place = "center" | "top" | "bottom";
const MARK_OPTIONS: { type: MarkType; label: string; height: number; place: Place }[] = [
  { type: "highlight", label: "Highlight", height: 22, place: "center" },
  { type: "strike-through", label: "Strike-through", height: 12, place: "center" },
  { type: "overline", label: "Overline", height: 4, place: "top" },
  { type: "underline", label: "Underline", height: 4, place: "bottom" },
];

// Slightly uneven corners (from Figma) give the swatch a hand-cut, inky edge.
const SWATCH_RADIUS = "4px 5.2px 5px 6.2px"; // tl tr br bl

const JUSTIFY: Record<Place, string> = {
  center: "justify-center",
  top: "justify-start pt-[8px]",
  bottom: "justify-end pb-[8px]",
};

/** The settings panel above the active pen: a mark-type row + opacity slider, both
 *  driving the shared selection style. Lisse squircle container. */
export function MarkerPopover({
  inkColor,
  opacity,
  markType,
  onOpacity,
  onMarkType,
}: {
  inkColor: string;
  opacity: number;
  markType: MarkType;
  onOpacity: (next: number) => void;
  onMarkType: (next: MarkType) => void;
}) {
  // Endpoint-pooled ink ramp recoloured to the live ink — a mini highlighter swatch.
  const rgb = hexToRgb(inkColor);
  const swatchInk = `linear-gradient(88deg, rgba(${rgb}, 0.4) 2.2%, rgba(${rgb}, 0.1) 7%, rgba(${rgb}, 0.3) 96%, rgba(${rgb}, 0.6) 100%)`;

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
          {MARK_OPTIONS.map((m) => {
            const selected = m.type === markType;
            return (
              <button
                key={m.type}
                type="button"
                aria-label={m.label}
                aria-pressed={selected}
                onClick={() => onMarkType(m.type)}
                data-focus-ring
                className={`group flex h-[44px] flex-1 flex-col items-center overflow-hidden rounded-[12px] transition-colors duration-200 ${JUSTIFY[m.place]} ${selected ? "bg-[#efeeed]" : "bg-transparent"}`}
              >
                <span
                  aria-hidden
                  className="w-[36px] shrink-0 transition-transform duration-150 group-active:scale-[0.96]"
                  style={{ height: m.height, borderRadius: SWATCH_RADIUS, backgroundImage: swatchInk }}
                />
              </button>
            );
          })}
        </div>
        <OpacitySlider inkColor={inkColor} value={opacity} onChange={onOpacity} />
      </div>
    </SmoothCorners>
  );
}
