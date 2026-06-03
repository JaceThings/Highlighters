import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PALETTES, resolveSwatch } from "@highlighters/core";
import type { ColorValue, PaletteSwatch, ShapeType } from "@highlighters/core";
import { SmoothCorners } from "@lisse/react";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { fmt2, fmtPx } from "../../components/playground/slider-utils.ts";
import { PaperCard } from "../../components/docs/PaperCard.tsx";
import { ScribbleLegend } from "../../components/docs/ScribbleLegend.tsx";
import { ScribbleFill } from "../../components/docs/ScribbleFill.tsx";
import { Preview, SnapPreview } from "../Preview.tsx";
import type { Quote } from "../quotes.ts";
import { usePlaygroundOptions, type PlaygroundOptions } from "../options-context.tsx";

// Defer each Preview until its section nears the viewport. One-way latch: once
// painted it never unmounts, so its marks persist and update in place.
function useSeen(rootMargin = "350px") {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return { ref, seen };
}

function readPath(o: PlaygroundOptions, path: string): unknown {
  const s = path.split(".");
  const top = (o as Record<string, unknown>)[s[0]];
  if (s.length === 1) return top;
  return top && typeof top === "object" ? (top as Record<string, unknown>)[s[1]] : undefined;
}
const getNum = (o: PlaygroundOptions, p: string, d: number): number => {
  const v = readPath(o, p);
  return typeof v === "number" ? v : d;
};
const getStr = (o: PlaygroundOptions, p: string, d: string): string => {
  const v = readPath(o, p);
  return typeof v === "string" ? v : d;
};
const getBool = (o: PlaygroundOptions, p: string, d: boolean): boolean => {
  const v = readPath(o, p);
  return typeof v === "boolean" ? v : d;
};

type Unit = "ratio" | "px" | "deg" | "ms";
const FORMAT: Record<Unit, (v: number) => string> = {
  ratio: fmt2,
  px: fmtPx,
  deg: (v) => `${Math.round(v)}°`,
  ms: (v) => `${Math.round(v)} ms`,
};

const TOGGLE_OPTS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

interface Base {
  title: string;
  desc: string;
}
type Demo =
  | (Base & { kind: "slider"; path: string; label: string; def: number; min: number; max: number; step: number; unit: Unit })
  | (Base & { kind: "pills"; path: string; aria: string; def: string; opts: ReadonlyArray<{ value: string; label: string }>; shape?: boolean })
  | (Base & { kind: "toggle"; path: string; aria: string; def: boolean })
  | (Base & { kind: "color" });

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
const SWATCH_CHIPS = SWATCH_REFS.map((ref) => ({
  ref,
  key: `${ref.palette}-${ref.swatch}`,
  hex: PALETTES[ref.palette].swatches[ref.swatch],
}));

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

function SwatchPicker() {
  const { options, set } = usePlaygroundOptions();
  const color = options.color;
  const activeHex = useMemo(() => colorToHex(color), [color]).toLowerCase();
  const isRef = !!color && typeof color === "object" && "swatch" in color;

  return (
    <div
      role="radiogroup"
      aria-label="Color swatch"
      className="flex w-full flex-wrap content-center items-center justify-center gap-3 px-4 py-5"
    >
      {SWATCH_CHIPS.map(({ ref, key, hex }) => {
          const selected = isRef && hex.toLowerCase() === activeHex;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${ref.palette} ${ref.swatch}`}
              data-focus-ring
              onClick={() => !selected && set("color", ref)}
              className="cursor-pointer p-1.5 -m-1.5 select-none"
            >
              <SmoothCorners asChild autoEffects={false} corners={{ radius: 8, smoothing: 0.6 }}>
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
  );
}

// Discrete (button) controls render as a scribble-underline legend.
function LegendControl({ demo }: { demo: Extract<Demo, { kind: "pills" | "toggle" }> }) {
  const { options, set, setShape } = usePlaygroundOptions();
  if (demo.kind === "toggle") {
    const on = getBool(options, demo.path, demo.def);
    return (
      <ScribbleLegend
        ariaLabel={demo.aria}
        options={TOGGLE_OPTS}
        value={on ? "on" : "off"}
        onChange={(v) => set(demo.path, v === "on")}
      />
    );
  }
  const value = getStr(options, demo.path, demo.def);
  return (
    <ScribbleLegend
      ariaLabel={demo.aria}
      options={demo.opts}
      value={value}
      onChange={demo.shape ? (v) => setShape(v as ShapeType) : (v) => set(demo.path, v)}
    />
  );
}

// A slider whose fill is a hand-drawn scribble, drawn/undrawn as the value moves.
function ScribbleSliderControl({ demo }: { demo: Extract<Demo, { kind: "slider" }> }) {
  const { options, set } = usePlaygroundOptions();
  // Fresh seed per slider so each scribble is uniquely hand-drawn.
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const onNum = useCallback(
    (v: number, fromDrag?: boolean) => set(demo.path, v, fromDrag),
    [set, demo.path],
  );
  return (
    <div className="px-5 py-4">
      <Slider
        label={demo.label}
        value={getNum(options, demo.path, demo.def)}
        min={demo.min}
        max={demo.max}
        step={demo.step}
        format={FORMAT[demo.unit]}
        onChange={onNum}
        renderFill={(ctx) => <ScribbleFill seed={seed} {...ctx} />}
      />
    </div>
  );
}

export function OptionDemo({ demo, quote }: { demo: Demo; quote?: Quote }) {
  const { ref, seen } = useSeen();
  // The `snap` demo swaps in a Range-based preview so the boundary clamp shows.
  return (
    <div ref={ref}>
      <Section title={demo.title} description={demo.desc}>
        <PaperCard>
          {seen && quote ? (
            demo.kind === "pills" && demo.path === "snap" ? (
              <SnapPreview quote={quote} />
            ) : (
              <Preview quote={quote} />
            )
          ) : (
            <div className="flex-1" style={{ minHeight: 216 }} aria-hidden />
          )}
          {demo.kind === "slider" ? (
            <ScribbleSliderControl demo={demo} />
          ) : demo.kind === "color" ? (
            <SwatchPicker />
          ) : (
            <LegendControl demo={demo} />
          )}
        </PaperCard>
      </Section>
    </div>
  );
}

// Every option, one demo each, in build order.
export const OPTION_DEMOS: Demo[] = [
  { kind: "pills", title: "markType", aria: "Mark kind", path: "markType", def: "highlight", shape: true, opts: [{ value: "highlight", label: "Highlight" }, { value: "underline", label: "Underline" }, { value: "overline", label: "Overline" }, { value: "strike-through", label: "Strike" }], desc: "The kind of mark — a highlight band, an under/overline, or a strike-through. (shape is a synonym.)" },
  { kind: "color", title: "color", desc: "The ink hue. Pick a canonical highlighter swatch — a clean { palette, swatch } reference. Defaults to fluorescent yellow." },
  { kind: "slider", title: "opacity", label: "Opacity", path: "opacity", def: 0.5, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Overall ink alpha. Lower lets more of the text read through the band." },
  { kind: "toggle", title: "blendMode (stack)", aria: "Stack", path: "stack", def: true, desc: "Overlap optics. On = multiply: two passes darken where they cross, like real translucent ink. Off = normal: same-colour overlaps merge flat." },
  { kind: "pills", title: "tip.type", aria: "Nib", path: "tip.type", def: "chisel", opts: [{ value: "chisel", label: "Chisel" }, { value: "bullet", label: "Bullet" }, { value: "fine", label: "Fine" }], desc: "Nib shape — a broad slanted chisel, a rounded bullet, or a fine point." },
  { kind: "slider", title: "tip.angle", label: "Angle", path: "tip.angle", def: 35, min: 0, max: 90, step: 1, unit: "deg", desc: "Chisel slant baked into each band." },
  { kind: "slider", title: "tip.overshoot", label: "Overshoot", path: "tip.overshoot", def: 2, min: -8, max: 12, step: 1, unit: "px", desc: "How far each end runs past the text. Positive overruns like a real swipe; negative stops short of the glyphs." },
  { kind: "slider", title: "tip.overshootJitter", label: "End randomness", path: "tip.overshootJitter", def: 1, min: 0, max: 8, step: 1, unit: "px", desc: "Per-end random variance of the overshoot, so the two ends never land on an identical inset." },
  { kind: "slider", title: "ink.flow", label: "Flow", path: "ink.flow", def: 0.5, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Juiciness — deposit amount. Raises the band width and softens the edges." },
  { kind: "slider", title: "ink.viscosity", label: "Viscosity", path: "ink.viscosity", def: 0.5, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Inverse of flow — sharpens edges and raises skip frequency." },
  { kind: "slider", title: "ink.saturation", label: "Saturation", path: "ink.saturation", def: 0.7, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Per-pass intensity of the deposited ink." },
  { kind: "slider", title: "ink.feathering", label: "Feathering", path: "ink.feathering", def: 0.3, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Capillary lateral spread at the edges, the way ink wicks sideways into paper." },
  { kind: "slider", title: "ink.streakiness", label: "Streakiness", path: "ink.streakiness", def: 0.35, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Lengthwise lighter/darker lanes within a stroke — the single biggest “real highlighter” tell." },
  { kind: "slider", title: "ink.dryout", label: "Dryout", path: "ink.dryout", def: 0.15, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Probabilistic alpha gaps — the marker skipping as it runs dry." },
  { kind: "slider", title: "ink.flowFade", label: "Flow fade", path: "ink.flowFade", def: 0.5, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Directional dry-out: each line starts saturated where the nib lands and fades drier toward its end." },
  { kind: "slider", title: "edge.waviness", label: "Waviness", path: "edge.waviness", def: 1.5, min: 0, max: 4, step: 0.1, unit: "px", desc: "Peak displacement of the wavy edge. Zero gives a clean straight edge." },
  { kind: "slider", title: "edge.frequency", label: "Frequency", path: "edge.frequency", def: 22, min: 8, max: 48, step: 1, unit: "px", desc: "Segment length between wave vertices — smaller is wavier. Width-independent." },
  { kind: "slider", title: "edge.roughness", label: "Roughness", path: "edge.roughness", def: 0.3, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "High-frequency micro-jitter on top of the base wave." },
  { kind: "pills", title: "edge.cap", aria: "Cap", path: "edge.cap", def: "round", opts: [{ value: "flat", label: "Flat" }, { value: "round", label: "Round" }, { value: "square", label: "Square" }], desc: "End-cap style for a band's leading and trailing edges." },
  { kind: "slider", title: "edge.radius", label: "Radius", path: "edge.radius", def: 4, min: 0, max: 12, step: 1, unit: "px", desc: "Corner radius, clamped against short marks." },
  { kind: "slider", title: "paper.absorbency", label: "Absorbency", path: "paper.absorbency", def: 0.3, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "How thirsty the paper is. Higher wicks more ink, growing the feather and softening edges." },
  { kind: "pills", title: "snap", aria: "Snap", path: "snap", def: "word", opts: [{ value: "none", label: "None" }, { value: "word", label: "Word" }, { value: "line", label: "Line" }, { value: "glyph", label: "Glyph" }], desc: "Clamps each end to a text boundary before overshoot is applied, so a mark never starts or stops mid-whitespace." },
  { kind: "pills", title: "animation.trigger", aria: "Trigger", path: "animation.trigger", def: "immediate", opts: [{ value: "immediate", label: "Immediate" }, { value: "in-view", label: "In view" }], desc: "When the entrance begins — on mount, or when the mark scrolls into view (an IntersectionObserver)." },
];
