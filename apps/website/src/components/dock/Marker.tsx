import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { DOCK_H } from "./constants.ts";
import { Pen } from "./PenSvg.tsx";
import { hexToOklch, oklchToCss } from "./oklch.ts";
import type { PenTip } from "../../selection-style.tsx";

// Render the SVG wider so the body (26.1475 of the 43-unit viewBox) lands at 27px.
const SVG_W = (27 * 43) / 26.1475; // ~44.4px

// The button clips the pen to the tray floor; the rise (selected) and hover pop
// live in CSS on .dock-pen-art.
const FRAME_H = DOCK_H;
const REST_TOP = FRAME_H - 95.45; // resting offset above the tray floor
const GAP = 71 - SVG_W; // pen centres sit 71px apart

// Opacity readout on the barrel (Figma "Marker Value") — centred just below the ink
// band, at viewBox y87.
const NUM_CENTER_Y = 87 * (SVG_W / 43);
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

// Per-pen opacity readout on the barrel, fading in/out across the 99↔100 boundary —
// without ever rendering "100": at full opacity it keeps showing the last sub-100
// value and just fades that away.
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

// Crossfade inks rather than interpolate — complementary inks can't morph without a
// false green or a grey dip (gamut geometry).
const INK_FADE_MS = 180;

interface PenDef {
  id: PenTip;
  label: string;
}

// Left → right: slant (default), round, flat.
const PENS: PenDef[] = [
  { id: "slant", label: "Chisel marker" },
  { id: "round", label: "Bullet marker" },
  { id: "flat", label: "Flat marker" },
];

// The Pen takes an oklch() string — its tip shading reads OKLCH lightness.
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
  // Pre-paint, so the dissolving overlay is in place before the new base paints.
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

  return (
    <div className="flex items-end" style={{ gap: GAP }}>
      {PENS.map((p) => {
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
            data-focus-ring
            className="dock-pen relative block shrink-0 overflow-hidden"
            style={{ width: SVG_W, height: FRAME_H }}
          >
            <Pen tip={p.id} color={toPen(color)} width={SVG_W} className="dock-pen-art" style={place} />
            {fadeOut && (
              // Previous ink dissolving out. colorOnly skips the barrel shadow (no
              // doubling); keyed so rapid swaps restart the fade.
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
            {/* Opacity readout. The outer layer rides the pen transform
                (.dock-pen-art); OpacityReadout centres + fades the digits. */}
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
    </div>
  );
}
