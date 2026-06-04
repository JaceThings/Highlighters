import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { m } from "framer-motion";
import { DOCK_H, INK_FADE_MS } from "./constants.ts";
import { Pen } from "./PenSvg.tsx";
import { PEN_OUTLINES } from "./pen-outlines.ts";
import { useOutlineTuning } from "./outline-tuning.ts";
import { hexToOklch, oklchToCss } from "./oklch.ts";
import { useNavModality } from "../../hooks/useNavModality.ts";
import type { PenTip } from "../../selection-style.tsx";

// Render the SVG wider so the body (26.1475 of the 43-unit viewBox) lands at 27px.
const SVG_W = (27 * 43) / 26.1475; // ~44.4px

const FRAME_H = DOCK_H;
const REST_TOP = FRAME_H - 95.45; // resting offset above the tray floor
const GAP = 71 - SVG_W; // pen centres sit 71px apart
const STEP = SVG_W + GAP; // 71px between pen slots
const SELECTED_RISE = 24; // a selected pen lifts this much (see global.css)

// --- Traveling keyboard focus outline -------------------------------------------------
// One designed outline (pen-outlines.ts) traces the focused pen and springs between pens
// as focus moves. It renders at the pen art's scale, centred on the barrel and parked at
// the nib; the barrel runs past the floor and the slot box clips it there. The three nib
// silhouettes are stacked and crossfaded so the tip always matches the focused pen (they
// can't morph - the designed paths differ in structure - so the shape dissolves).
const SCALE = SVG_W / 43; // pen viewBox unit -> px
const OUTLINE_W = 39 * SCALE; // the designed outlines are 39 wide at the pen's scale
const OUTLINE_LEFT = (SVG_W - OUTLINE_W) / 2; // centre the band on the barrel
const OUTLINE_LIFT = 4; // sit the outline a touch above the nib

// Match the pen's rise easing/timing so the outline lift stays in step with the nib.
const OUTLINE_RISE = { duration: 0.24, ease: [0.2, 0, 0, 1] as const };
const OUTLINE_TRAVEL = { type: "spring", stiffness: 700, damping: 42 } as const;
const OUTLINE_FADE = { duration: 0.16 } as const;

/** The single focus outline: a slot box clipped at the tray floor, sprung to the focused
 *  pen and lifted to its nib height, with the three designed nib silhouettes stacked and
 *  crossfaded to match the tip. `idx` is the keyboard-focused pen (null = hidden); it
 *  parks at its last slot while fading so it never flies in from slot 0. */
function MarkerOutline({ idx, selectedIdx }: { idx: number | null; selectedIdx: number }) {
  const { tips, preview } = useOutlineTuning();
  // A previewed tip (dev tuning) force-shows its outline; otherwise follow keyboard focus.
  const previewIdx = preview ? PENS.findIndex((p) => p.id === preview) : null;
  const activeIdx = previewIdx ?? idx;
  const lastIdx = useRef(0);
  // Park at the last focused slot while fading out. A post-commit effect (not a
  // render-phase ref write) keeps this concurrent-safe.
  useEffect(() => {
    if (activeIdx !== null) lastIdx.current = activeIdx;
  });
  const slot = activeIdx ?? lastIdx.current;
  const focusedTip = PENS[slot].id;
  const risen = slot === selectedIdx;
  return (
    <m.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-hidden"
      style={{ width: SVG_W, height: FRAME_H }}
      initial={false}
      animate={{ x: slot * STEP, opacity: activeIdx === null ? 0 : 1 }}
      transition={{ x: OUTLINE_TRAVEL, opacity: OUTLINE_FADE }}
    >
      <m.div
        className="absolute"
        style={{ left: OUTLINE_LEFT, top: REST_TOP - OUTLINE_LIFT, width: OUTLINE_W }}
        initial={false}
        animate={{ y: risen ? -SELECTED_RISE : 0 }}
        transition={OUTLINE_RISE}
      >
        {PENS.map((p) => {
          const o = PEN_OUTLINES[p.id];
          const t = tips[p.id];
          return (
            <m.svg
              key={p.id}
              className="absolute top-0 left-0"
              width={OUTLINE_W}
              viewBox={`0 0 ${o.w} ${o.h}`}
              style={{ overflow: "visible", x: t.dx, y: t.dy, scale: t.scale, transformOrigin: "top center" }}
              initial={false}
              animate={{ opacity: p.id === focusedTip ? 1 : 0 }}
              transition={OUTLINE_FADE}
            >
              <path d={o.d} fillRule="evenodd" fill="var(--color-text-primary)" />
            </m.svg>
          );
        })}
      </m.div>
    </m.div>
  );
}

const NUM_CENTER_Y = 87 * SCALE;
const NUM_STYLE: CSSProperties = {
  transform: "translateY(-50%)",
  lineHeight: 1,
  fontFamily: 'system-ui, -apple-system, "SF Pro Text", sans-serif',
  fontWeight: 600,
  fontSize: 9.5,
  letterSpacing: "-0.2px",
  color: "#86858a",
  transition: "opacity 160ms ease",
};

// Fades out across the 99↔100 boundary without ever rendering "100": at full opacity
// it keeps the last sub-100 value and just fades it away.
function OpacityReadout({ pct }: { pct: number }) {
  const visible = pct < 100;
  const lastVisible = useRef(visible ? pct : 99);
  if (visible) lastVisible.current = pct;
  return (
    <span
      className="absolute left-0 w-full text-center tabular-nums"
      style={{ ...NUM_STYLE, top: NUM_CENTER_Y, opacity: visible ? 1 : 0 }}
    >
      {lastVisible.current}
    </span>
  );
}

// The pen tips are opaque, so a dissolve between the old and new colour is clean - and
// it sidesteps the false mid-hue an interpolation would cross. (Translucent marks can't
// crossfade without double-darkening, so they morph in OKLCH; see useAnimatedColor.)
interface PenDef {
  id: PenTip;
  label: string;
}

const PENS: PenDef[] = [
  { id: "slant", label: "Chisel marker" },
  { id: "round", label: "Bullet marker" },
  { id: "fine", label: "Fine marker" },
];

// Pen wants an oklch() string - its tip shading reads OKLCH lightness.
const toPen = (hex: string) => oklchToCss(hexToOklch(hex));

export function MarkerRow({
  color,
  selected,
  opacityByPen,
  onSelect,
  onActivate,
}: {
  color: string;
  selected: PenTip;
  /** Per-pen ink opacity (0–1); each pen shows its own as a percentage. */
  opacityByPen: Record<PenTip, number>;
  onSelect: (pen: PenTip) => void;
  /** Clicking the already-selected pen opens the marker popover on this button. */
  onActivate: (button: HTMLButtonElement) => void;
}) {
  // The new colour shows instantly on the base pen; the previous colour renders on
  // top and dissolves out.
  const [fadeOut, setFadeOut] = useState<{ color: string; key: number } | null>(null);
  const prevColor = useRef(color);
  const keyRef = useRef(0);
  // useLayoutEffect so the dissolving overlay is painted before the new base.
  useLayoutEffect(() => {
    if (prevColor.current === color) return;
    const previous = prevColor.current;
    prevColor.current = color;
    keyRef.current += 1;
    const id = keyRef.current;
    setFadeOut({ color: previous, key: id });
    const timer = setTimeout(
      () => setFadeOut((f) => (f && f.key === id ? null : f)),
      INK_FADE_MS + 40,
    );
    return () => clearTimeout(timer);
  }, [color]);

  // Which pen the traveling outline points at (null = hidden). Tracked here rather than
  // with :focus-visible because one shared outline animates between the pens; the same
  // useNavModality the global focus ring uses gates keyboard vs pointer.
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const keyboard = useNavModality();

  const selectedIdx = PENS.findIndex((p) => p.id === selected);

  return (
    <div className="relative flex items-end" style={{ gap: GAP }}>
      {PENS.map((p, i) => {
        const isSelected = p.id === selected;
        const pct = Math.round(opacityByPen[p.id] * 100);
        const place: CSSProperties = { position: "absolute", left: 0, top: REST_TOP };
        return (
          <button
            key={p.id}
            type="button"
            aria-label={p.label}
            aria-pressed={isSelected}
            onClick={(e) => (isSelected ? onActivate(e.currentTarget) : onSelect(p.id))}
            onFocus={() => {
              if (keyboard.current) setFocusIdx(i);
            }}
            onBlur={(e) => {
              // Keep the outline alive while focus hops to a sibling pen, so it travels
              // instead of blinking off and on.
              if (!(e.relatedTarget as HTMLElement | null)?.closest(".dock-pen")) {
                setFocusIdx((prev) => (prev === i ? null : prev));
              }
            }}
            className="dock-pen relative block shrink-0 overflow-hidden"
            style={{ width: SVG_W, height: FRAME_H }}
          >
            <Pen tip={p.id} color={toPen(color)} width={SVG_W} className="dock-pen-art" style={place} />
            {fadeOut && (
              // colorOnly skips the barrel shadow (no doubling); keyed so rapid swaps
              // restart the fade.
              <Pen
                key={fadeOut.key}
                tip={p.id}
                color={toPen(fadeOut.color)}
                width={SVG_W}
                colorOnly
                className="dock-pen-art"
                style={{ ...place, animation: `dock-ink-out ${INK_FADE_MS}ms ease forwards` }}
              />
            )}
            {/* Outer layer rides the pen transform (.dock-pen-art) so the digits
                track the pen's rise/pop. */}
            <span
              aria-hidden
              className="dock-pen-art pointer-events-none absolute"
              style={{ left: 0, top: REST_TOP, width: SVG_W }}
            >
              <OpacityReadout pct={pct} />
            </span>
          </button>
        );
      })}
      <MarkerOutline idx={focusIdx} selectedIdx={selectedIdx} />
    </div>
  );
}
