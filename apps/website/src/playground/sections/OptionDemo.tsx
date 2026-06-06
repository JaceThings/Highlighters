import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShapeType } from "@highlighters/core";
import { AnimatePresence, m } from "framer-motion";
import { Section } from "../../components/playground/Section.tsx";
import { Slider } from "../../components/playground/Slider.tsx";
import { fmt2, fmtPx } from "../../components/playground/slider-utils.ts";
import { PaperCard } from "../../components/docs/PaperCard.tsx";
import { ScribbleLegend } from "../../components/docs/ScribbleLegend.tsx";
import { ScribbleFill } from "../../components/docs/ScribbleFill.tsx";
import { ScribbleSwatch, ScribbleLasso } from "../../components/docs/ScribbleSwatch.tsx";
import { Preview, SnapPreview } from "../Preview.tsx";
import { StaticQuote } from "../quote-render.tsx";
import { strategyFor } from "../quote-marks.ts";
import type { Quote } from "../quotes.ts";
import { usePlaygroundOptions, colorToHex, type PlaygroundOptions } from "../options-context.tsx";
import { playMarkerPop, primeMarkerAudio } from "../../lib/marker-audio.ts";

// Defer each Preview until its section nears the viewport. One-way latch: once painted it never unmounts.
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
  /** Option code: stable key, also shown in the heading and keying the quote logic. */
  title: string;
  /** Plain-English heading, e.g. "Slant angle". */
  name: string;
  desc: string;
}
type Demo =
  | (Base & { kind: "slider"; path: string; label: string; def: number; min: number; max: number; step: number; unit: Unit; floor?: number })
  | (Base & { kind: "pills"; path: string; aria: string; def: string; opts: ReadonlyArray<{ value: string; label: string }>; shape?: boolean })
  | (Base & { kind: "toggle"; path: string; aria: string; def: boolean })
  | (Base & { kind: "color" });

// The six highlighter inks, warm -> cool.
const SWATCH_COLORS = [
  { id: "yellow", label: "Yellow", hex: "#f7d054" },
  { id: "orange", label: "Orange", hex: "#f4b460" },
  { id: "pink", label: "Pink", hex: "#ed78ab" },
  { id: "blue", label: "Blue", hex: "#7dd4fb" },
  { id: "green", label: "Green", hex: "#c6dfb6" },
  { id: "slate", label: "Slate", hex: "#b2cede" },
];
const SWATCH_CHIPS = SWATCH_COLORS.map((c) => ({
  ...c,
  // Stable per-swatch seed so each blob keeps its own scribble across renders.
  seed: [...c.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7),
}));

const BLOB_PX = 33;
const LASSO_PX = 64; // larger than the blob so the lasso rings it with a gap
const LASSO_WRAP = "pointer-events-none absolute top-1/2 left-1/2";
const LASSO_WRAP_STYLE = { width: LASSO_PX, height: LASSO_PX, x: "-50%", y: "-50%" };
const LASSO_EXIT = { opacity: 0, transition: { duration: 0.12 } };

function SwatchPicker() {
  const { options, set } = usePlaygroundOptions();
  const color = options.color;
  // Shared colour is a hex, so match swatches by resolved hex (dock and picker ring the same swatch).
  const activeHex = useMemo(() => colorToHex(color, "#f7d054"), [color]).toLowerCase();
  // Bump per pick so the lasso re-draws. Deterministic seed (not Math.random) for strict-mode double-invokes.
  const [lassoSeed, setLassoSeed] = useState(() => SWATCH_CHIPS[0].seed * 31);
  // Keyboard-focused swatch (not the selected one): ringed with a faded preview lasso, not a focus outline.
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <div
      role="radiogroup"
      aria-label="Color swatch"
      className="flex items-center gap-2 px-4 py-5"
      onPointerEnter={primeMarkerAudio}
    >
      {SWATCH_CHIPS.map(({ id, label, seed, hex }) => {
        const selected = hex.toLowerCase() === activeHex;
        const isPreview = focused === id && !selected;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            // Preview only on :focus-visible, never a mouse click. The faded lasso is the focus indicator.
            onFocus={(e) => {
              if (e.currentTarget.matches(":focus-visible")) setFocused(id);
            }}
            onBlur={() => setFocused((f) => (f === id ? null : f))}
            onClick={() => {
              if (selected) return;
              set("color", hex);
              setLassoSeed((s) => s + 1);
              playMarkerPop();
            }}
            className={`relative flex flex-1 select-none items-center justify-center outline-none ${selected ? "cursor-default" : "cursor-pointer"}`}
          >
            <span className="relative block" style={{ width: BLOB_PX, height: BLOB_PX }}>
              <ScribbleSwatch hex={hex} seed={seed} size={BLOB_PX} />
              <AnimatePresence>
                {selected ? (
                  <m.span key={lassoSeed} className={LASSO_WRAP} style={LASSO_WRAP_STYLE} exit={LASSO_EXIT}>
                    <ScribbleLasso seed={lassoSeed} size={LASSO_PX} />
                  </m.span>
                ) : isPreview ? (
                  <m.span key={`preview-${id}`} className={LASSO_WRAP} style={LASSO_WRAP_STYLE} initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={LASSO_EXIT}>
                    <ScribbleLasso seed={seed} size={LASSO_PX} draw={false} />
                  </m.span>
                ) : null}
              </AnimatePresence>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Discrete controls render as a scribble-underline legend.
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

// A slider whose fill is a scribble, drawn/undrawn as the value moves.
function ScribbleSliderControl({ demo }: { demo: Extract<Demo, { kind: "slider" }> }) {
  const { options, set } = usePlaygroundOptions();
  // Fresh seed per slider so each scribble is unique.
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
        floor={demo.floor}
        format={FORMAT[demo.unit]}
        onChange={onNum}
        renderFill={(ctx) => <ScribbleFill seed={seed} {...ctx} />}
        scrubSound
      />
    </div>
  );
}

export function OptionDemo({ demo, quote }: { demo: Demo; quote?: Quote }) {
  const { ref, seen } = useSeen();
  return (
    <div ref={ref} className="cv-demo">
      <Section
        title={
          <>
            {demo.name}{" "}
            <span className="font-mono text-[0.8em] font-normal tracking-normal text-text-secondary">
              ({demo.title})
            </span>
          </>
        }
        description={demo.desc}
      >
        <PaperCard>
          {/* StaticQuote reserves Preview's exact height so the card never resizes when marks mount
              (a resize would re-raster the paper/scribble SVGs). */}
          {quote == null ? (
            <div className="flex-1" style={{ minHeight: 216 }} aria-hidden />
          ) : !seen ? (
            <StaticQuote quote={quote} />
          ) : demo.kind === "pills" && demo.path === "snap" ? (
            <SnapPreview quote={quote} />
          ) : (
            <Preview
              quote={quote}
              strategy={strategyFor(demo.title)}
              lockTipType={demo.kind === "slider" && demo.path === "tip.angle" ? "chisel" : undefined}
            />
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

// Every option, one demo each, in build order. `desc` is user-facing copy, not a code comment.
export const OPTION_DEMOS: Demo[] = [
  { kind: "pills", title: "markType", name: "Mark type", aria: "Mark kind", path: "markType", def: "highlight", shape: true, opts: [{ value: "highlight", label: "Highlight" }, { value: "underline", label: "Underline" }, { value: "overline", label: "Overline" }, { value: "strike-through", label: "Strike" }], desc: "The kind of mark: a highlight band, an under or overline, or a strikethrough. (shape is a synonym.)" },
  { kind: "color", title: "color", name: "Colour", desc: "The ink hue. Pick a canonical highlighter swatch, a clean { palette, swatch } reference. Defaults to fluorescent yellow." },
  { kind: "slider", title: "opacity", name: "Opacity", label: "Opacity", path: "opacity", def: 0.5, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Overall ink alpha. Lower lets more of the text read through the band." },
  { kind: "toggle", title: "blendMode", name: "Overlap optics", aria: "Stack", path: "stack", def: true, desc: "How overlaps composite. On = multiply: two passes darken where they cross, like real translucent ink. Off = normal: same colour overlaps merge flat." },
  { kind: "pills", title: "tip.type", name: "Nib shape", aria: "Nib", path: "tip.type", def: "chisel", opts: [{ value: "chisel", label: "Chisel" }, { value: "bullet", label: "Bullet" }, { value: "fine", label: "Fine" }], desc: "Nib shape: a broad slanted chisel, a rounded bullet, or a fine point." },
  { kind: "slider", title: "tip.angle", name: "Slant angle", label: "Angle", path: "tip.angle", def: 8, min: 0, max: 90, step: 1, unit: "deg", floor: 5, desc: "Chisel slant baked into each band, never quite flat. Only the chisel slants; the bullet and the fine nib do not (fine is the same shape, just with no slant)." },
  { kind: "slider", title: "tip.overshoot", name: "Overshoot", label: "Overshoot", path: "tip.overshoot", def: 2, min: -8, max: 12, step: 1, unit: "px", desc: "How far each end runs past the text. Positive overruns like a real swipe; negative stops short of the glyphs." },
  { kind: "slider", title: "tip.overshootJitter", name: "End randomness", label: "End randomness", path: "tip.overshootJitter", def: 1, min: 0, max: 8, step: 1, unit: "px", desc: "Random variance per end, so the two ends never land on an identical inset." },
  { kind: "slider", title: "ink.flow", name: "Ink flow", label: "Flow", path: "ink.flow", def: 0.5, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Juiciness: the deposit amount. Raises the band width and softens the edges." },
  { kind: "slider", title: "ink.viscosity", name: "Viscosity", label: "Viscosity", path: "ink.viscosity", def: 0.5, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Inverse of flow: sharpens edges and raises skip frequency." },
  { kind: "slider", title: "ink.feathering", name: "Feathering", label: "Feathering", path: "ink.feathering", def: 0.3, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Capillary lateral spread at the edges, the way ink wicks sideways into paper." },
  { kind: "slider", title: "ink.streakiness", name: "Streakiness", label: "Streakiness", path: "ink.streakiness", def: 0.35, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Lengthwise lighter or darker lanes within a stroke, the single biggest “real highlighter” tell." },
  { kind: "slider", title: "ink.dryout", name: "Dryout", label: "Dryout", path: "ink.dryout", def: 0.15, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Probabilistic alpha gaps: the marker skipping as it runs dry." },
  { kind: "slider", title: "ink.flowFade", name: "Flow fade", label: "Flow fade", path: "ink.flowFade", def: 0.5, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Directional dryout: each line starts saturated where the nib lands and fades drier toward its end." },
  { kind: "slider", title: "edge.waviness", name: "Waviness", label: "Waviness", path: "edge.waviness", def: 1.5, min: 0, max: 4, step: 0.1, unit: "px", desc: "Peak displacement of the wavy edge. Zero gives a clean straight edge." },
  { kind: "slider", title: "edge.frequency", name: "Wave frequency", label: "Frequency", path: "edge.frequency", def: 22, min: 8, max: 48, step: 1, unit: "px", desc: "Segment length between wave vertices, smaller is wavier. Independent of width." },
  { kind: "slider", title: "edge.roughness", name: "Roughness", label: "Roughness", path: "edge.roughness", def: 0.3, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "Rapid micro jitter layered on top of the base wave." },
  { kind: "pills", title: "edge.cap", name: "Cap style", aria: "Cap", path: "edge.cap", def: "round", opts: [{ value: "flat", label: "Flat" }, { value: "round", label: "Round" }, { value: "square", label: "Square" }], desc: "Cap style for a band's leading and trailing edges." },
  { kind: "slider", title: "edge.radius", name: "Corner radius", label: "Radius", path: "edge.radius", def: 4, min: 0, max: 12, step: 1, unit: "px", desc: "Corner radius, clamped against short marks." },
  { kind: "slider", title: "paper.absorbency", name: "Paper absorbency", label: "Absorbency", path: "paper.absorbency", def: 0.3, min: 0, max: 1, step: 0.01, unit: "ratio", desc: "How thirsty the paper is. Higher wicks more ink, growing the feather and softening edges." },
  { kind: "pills", title: "snap", name: "Snap", aria: "Snap", path: "snap", def: "word", opts: [{ value: "none", label: "None" }, { value: "word", label: "Word" }, { value: "line", label: "Line" }, { value: "glyph", label: "Glyph" }], desc: "Clamps each end to a text boundary before overshoot is applied, so a mark never starts or stops inside whitespace." },
];
