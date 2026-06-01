import { useCallback, useMemo } from "react";
import { SmoothCorners } from "@lisse/react";
import { PALETTES, resolveSwatch } from "@highlighters/core";
import type {
  ColorValue,
  PaletteName,
  PaletteSwatch,
} from "@highlighters/core";
import { FigureCard } from "../../components/playground/FigureCard.tsx";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { ROW_DIVIDER, SLIDER_ROW } from "../../components/playground/styles.ts";
import { fmt2 } from "../../components/playground/slider-utils.ts";
import { Preview } from "../Preview.tsx";
import { usePlaygroundOptions } from "../options-context.tsx";

// Mirrors RadioPillGroup's hit-area + Apple-ease crossfade so the swatch row
// reads as the same control family as the pill groups elsewhere.
const SWATCH_HITAREA = "cursor-pointer p-1.5 -m-1.5 select-none";

// A canonical spread of build colors. Rather than expose a palette-FAMILY mode,
// we surface representative swatches directly: the vivid fluorescent hues and
// the soft mild hues. Each is a `{ palette, swatch }` ref so picking one stores
// a clean library reference; the resolved hex paints the chip and matches the
// active ring. Order favors the least-text-obscuring hues first (R15).
const SWATCH_REFS: ReadonlyArray<PaletteSwatch> = [
  { palette: "fluorescent", swatch: "yellow" },
  { palette: "fluorescent", swatch: "green" },
  { palette: "fluorescent", swatch: "orange" },
  { palette: "fluorescent", swatch: "pink" },
  { palette: "fluorescent", swatch: "blue" },
  { palette: "fluorescent", swatch: "purple" },
  { palette: "mild", swatch: "yellow" },
  { palette: "mild", swatch: "green" },
  { palette: "mild", swatch: "blue" },
  { palette: "mild", swatch: "pink" },
  { palette: "mild", swatch: "orange" },
  { palette: "mild", swatch: "purple" },
];

// Resolve each ref to its concrete hex once for chip painting + active matching.
const SWATCH_CHIPS: ReadonlyArray<{ ref: PaletteSwatch; key: string; hex: string }> =
  SWATCH_REFS.map((ref) => ({
    ref,
    key: `${ref.palette}-${ref.swatch}`,
    hex: PALETTES[ref.palette as PaletteName].swatches[ref.swatch],
  }));

/** Normalize the live `color` to a concrete CSS color for the custom input. */
function colorToHex(color: ColorValue | PaletteSwatch | undefined): string {
  if (typeof color === "string") return color;
  if (color && typeof color === "object" && "swatch" in color) {
    try {
      return resolveSwatch(color);
    } catch {
      return "#fff14d";
    }
  }
  return "#fff14d";
}

export function ColorSection() {
  const { options, set } = usePlaygroundOptions();

  const color = options.color;

  // The active swatch chip: a chip is "selected" when the live color resolves to
  // the same hex. A custom (typed) color leaves no chip ringed — picking a color
  // is just one build control, there is no palette-family mode behind it.
  const activeHex = useMemo(() => colorToHex(color), [color]).toLowerCase();
  const isRefColor =
    !!color && typeof color === "object" && "swatch" in color;

  const opacity = options.opacity ?? 0.5;

  const onSwatchPick = useCallback(
    (ref: PaletteSwatch) => set("color", ref),
    [set],
  );

  const onCustomColor = useCallback(
    (next: string) => set("color", next),
    [set],
  );

  const onOpacityChange = useCallback(
    (v: number, fromDrag?: boolean) => set("opacity", v, fromDrag),
    [set],
  );

  return (
    <Section
      title="Colour"
      description="The ink itself. Pick a canonical highlighter hue or drop in any custom colour, then dial the overall ink alpha — lower lets more of the text show through."
    >
      <FigureCard>
        <Preview />
        <div className={`w-full ${ROW_DIVIDER}`}>
          <div
            role="radiogroup"
            aria-label="Color swatch"
            className="flex w-full flex-wrap content-center items-center justify-center gap-3 p-3"
            data-focus-section="playground-color-swatch"
          >
            {SWATCH_CHIPS.map(({ ref, key, hex }) => {
              // Only ring a chip when the live color is an actual swatch ref that
              // resolves to this chip's hex — a typed custom color rings nothing.
              const selected = isRefColor && hex.toLowerCase() === activeHex;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${ref.palette} ${ref.swatch}`}
                  title={`${ref.palette} ${ref.swatch}`}
                  data-focus-ring
                  onClick={() => {
                    if (selected) return;
                    onSwatchPick(ref);
                  }}
                  className={SWATCH_HITAREA}
                >
                  <SmoothCorners
                    asChild
                    autoEffects={false}
                    corners={{ radius: 8, smoothing: 0.6 }}
                  >
                    <span
                      className="block h-7 w-7 transition-[box-shadow] duration-[350ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]"
                      style={{
                        backgroundColor: hex,
                        boxShadow: selected
                          ? "inset 0 0 0 1.5px rgba(126,117,108,0.55), 0 0 0 3px rgba(126,117,108,0.18)"
                          : "inset 0 0 0 1px rgba(126,117,108,0.18)",
                      }}
                    />
                  </SmoothCorners>
                </button>
              );
            })}
          </div>
        </div>
        <div
          className={`flex w-full items-center justify-center gap-3 p-4 ${ROW_DIVIDER}`}
        >
          <label
            htmlFor="playground-custom-color"
            className="text-[14px] leading-[1.2] font-medium tracking-[-0.25px] text-text-input"
          >
            Custom color
          </label>
          <SmoothCorners
            asChild
            autoEffects={false}
            corners={{ radius: 8, smoothing: 0.6 }}
          >
            <span
              className="relative block h-8 w-12 overflow-hidden"
              style={{
                boxShadow: "inset 0 0 0 1px rgba(126,117,108,0.18)",
              }}
            >
              <input
                id="playground-custom-color"
                type="color"
                value={activeHex.startsWith("#") ? activeHex : "#fff14d"}
                onChange={(e) => onCustomColor(e.target.value)}
                aria-label="Custom ink color"
                data-focus-ring
                className="absolute inset-[-4px] h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer appearance-none border-0 bg-transparent p-0"
              />
            </span>
          </SmoothCorners>
          <span className="font-mono text-[13px] leading-none font-medium tracking-[-0.25px] text-text-input">
            {activeHex.startsWith("#") ? activeHex.toUpperCase() : activeHex}
          </span>
        </div>
        <div className={SLIDER_ROW}>
          <Slider
            label="Opacity"
            description="Overall ink strength — lower lets more text show through."
            value={opacity}
            min={0}
            max={1}
            step={0.01}
            format={fmt2}
            onChange={onOpacityChange}
          />
        </div>
      </FigureCard>
    </Section>
  );
}
