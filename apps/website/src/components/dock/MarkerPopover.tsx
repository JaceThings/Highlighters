import { useMemo, type CSSProperties } from "react";
import { SmoothCorners } from "@lisse/react";
import type { ShadowConfig } from "@lisse/core";
import { buildMarkGeometry, resolveOptions } from "@highlighters/core";
import type { LineRect, MarkType } from "@highlighters/core";
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

// The preview "line" the band is shaped against. The nib (chisel/bullet/flat) + mark
// type drive the band's silhouette and position; the cell clips any overshoot.
const LINE_W = 24;
const LINE_H = 22;
// Ink crossfade duration, matching the dock pens.
const INK_FADE_MS = 180;

// Endpoint-pooled translucent ink, like the real marker (denser at both ends). Built
// from the animatable `--ink` via color-mix, so `transition: --ink` fades the whole
// gradient — transparency and all — in one element, no second copy.
const INK_GRADIENT =
  "linear-gradient(90deg," +
  " color-mix(in oklab, var(--ink) 50%, transparent) 0%," +
  " color-mix(in oklab, var(--ink) 33%, transparent) 16%," +
  " color-mix(in oklab, var(--ink) 33%, transparent) 84%," +
  " color-mix(in oklab, var(--ink) 50%, transparent) 100%)";

/**
 * One mark-type option: a real highlighter band — the active pen's actual
 * chisel/bullet/flat nib shape, wavy edge, and noise texture from the geometry
 * engine, filled with the endpoint-pooled translucent ink. The shape + texture are
 * colour-independent, so they're computed ONCE (memoised); only the `--ink` colour
 * changes, and it CSS-transitions, so a palette swap fades the ink with no extra mark
 * and no geometry rebuild.
 */
function MarkOption({
  type,
  label,
  selected,
  color,
  pen,
  seed,
  onSelect,
}: {
  type: MarkType;
  label: string;
  selected: boolean;
  color: string;
  pen: PenTip;
  seed: number;
  onSelect: (next: MarkType) => void;
}) {
  const ink = useMemo(() => {
    // Tighter overshoot than the live nib so the small stroke + caps fit the cell.
    const tip = { ...penToTip(pen).tip, overshoot: 4, overshootJitter: 0 };
    // Chisel/flat ends square off on thin bands (a flat nib lays a flat end), so a
    // thin under/over/strike doesn't read like the bullet's rounded cap. The bullet
    // ignores this — its cap radius is height-driven — so it stays round regardless.
    const radius = type === "highlight" ? (BASE_SELECTION_OPTIONS.edge?.radius ?? 3) : 0.8;
    const resolved = resolveOptions({
      ...BASE_SELECTION_OPTIONS,
      markType: type,
      tip,
      edge: { ...BASE_SELECTION_OPTIONS.edge, radius },
    });
    const line: LineRect = {
      left: 0, top: 0, width: LINE_W, height: LINE_H, seed, isFirst: true, isLast: true,
    };
    const geo = buildMarkGeometry(line, resolved, seed);
    // Static style (everything but the live colour), so the colour can transition.
    const style: CSSProperties = {
      position: "absolute",
      left: geo.box.x,
      top: geo.box.y,
      width: geo.box.width,
      height: geo.box.height,
      clipPath: geo.clipPath,
      WebkitClipPath: geo.clipPath,
      backgroundImage: INK_GRADIENT,
      maskImage: `url("${geo.noiseTile.dataUrl}")`,
      WebkitMaskImage: `url("${geo.noiseTile.dataUrl}")`,
      maskRepeat: "repeat",
      WebkitMaskRepeat: "repeat",
      maskSize: `${geo.noiseTile.width}px ${geo.noiseTile.height}px`,
      WebkitMaskSize: `${geo.noiseTile.width}px ${geo.noiseTile.height}px`,
      maskPosition: `${geo.maskOffset.x}px ${geo.maskOffset.y}px`,
      WebkitMaskPosition: `${geo.maskOffset.x}px ${geo.maskOffset.y}px`,
      mixBlendMode: "multiply",
      transition: `--ink ${INK_FADE_MS}ms ease`,
    };
    return style;
  }, [type, pen, seed]);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(type)}
      data-focus-ring
      className={`group flex h-[44px] flex-1 items-center justify-center overflow-hidden rounded-[12px] transition-colors duration-200 ${selected ? "bg-[#efeeed]" : "bg-transparent"}`}
    >
      <span
        className="relative transition-transform duration-150 group-active:scale-[0.96]"
        style={{ width: LINE_W, height: LINE_H }}
      >
        <div aria-hidden style={{ ...ink, ["--ink" as string]: color } as CSSProperties} />
      </span>
    </button>
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
          {MARK_OPTIONS.map((m, i) => (
            <MarkOption
              key={m.type}
              type={m.type}
              label={m.label}
              selected={m.type === markType}
              color={inkColor}
              pen={pen}
              seed={11 * (i + 1)}
              onSelect={onMarkType}
            />
          ))}
        </div>
        <OpacitySlider inkColor={inkColor} value={opacity} onChange={onOpacity} />
      </div>
    </SmoothCorners>
  );
}
