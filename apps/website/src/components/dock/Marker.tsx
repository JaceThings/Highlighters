import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { DOCK_H } from "./constants.ts";
import { Pen } from "./PenSvg.tsx";
import { hexToOklch, oklchToCss } from "./oklch.ts";
import type { PenTip } from "../../selection-style.tsx";

// Body must read as 27px wide, but the body spans only 26.1475 of the SVG's 43
// viewBox units, so we render the whole SVG wider to land the body at 27px.
const SVG_W = (27 * 43) / 26.1475; // ~44.4px

// Clip frame spans the full capsule height. Its TOP sits above even a raised tip
// (so the nib is never clipped); only the BOTTOM edge — the tray floor — cuts the
// pen body (the art is ~175px tall and overflows below it).
const FRAME_H = DOCK_H;
const REST_VISIBLE = 95.45; // pen height shown above the tray floor at rest
const REST_TOP = FRAME_H - REST_VISIBLE; // 49.55 — the pen's resting offset
// The selected pen rises (translateY -24px → shows 119.45) and unselected pens
// pop on hover (-6px). Both live in CSS (.dock-pen-art) so :hover can drive them
// off the button's aria-pressed state.
const GAP = 71 - SVG_W; // pen centres sit 71px apart

// Ink CROSSFADE duration. We dissolve between inks rather than interpolate: comp-
// lementary inks (blue<->yellow) can't morph without passing through a false green
// or a grey dip (gamut geometry).
const INK_FADE_MS = 180;

interface PenDef {
  id: PenTip;
  label: string;
}

// Left -> right: slant, round, flat. slant is the default raised pen.
const PENS: PenDef[] = [
  { id: "slant", label: "Chisel marker" },
  { id: "round", label: "Bullet marker" },
  { id: "flat", label: "Flat marker" },
];

// Hex ink -> oklch() string for the Pen (its tip shading reads OKLCH lightness).
const toPen = (hex: string) => oklchToCss(hexToOklch(hex));

export function MarkerRow({
  color,
  selected,
  onSelect,
}: {
  color: string;
  selected: PenTip;
  onSelect: (pen: PenTip) => void;
}) {
  // Crossfade the ink: the new colour shows instantly on the base pen while the
  // PREVIOUS colour renders on top and dissolves out — a clean fade, never a hue
  // sweep through green or a grey midpoint.
  const [fadeOut, setFadeOut] = useState<{ color: string; key: number } | null>(null);
  const prevColor = useRef(color);
  const keyRef = useRef(0);
  // useLayoutEffect (pre-paint) so the dissolving overlay is in place before the
  // browser paints the new base — otherwise the new colour flashes for a frame.
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
        // Position only; the rise/hover transform is CSS-driven (.dock-pen-art).
        const place: CSSProperties = {
          position: "absolute",
          left: 0,
          top: REST_TOP,
        };
        return (
          <button
            key={p.id}
            type="button"
            aria-label={p.label}
            aria-pressed={isSelected}
            onClick={() => onSelect(p.id)}
            data-focus-ring
            className="dock-pen relative block shrink-0 overflow-hidden"
            style={{ width: SVG_W, height: FRAME_H }}
          >
            <Pen
              tip={p.id}
              color={toPen(color)}
              width={SVG_W}
              className="dock-pen-art"
              style={place}
            />
            {fadeOut && (
              // Previous ink dissolving away to reveal the new base. colorOnly draws
              // ink without the body's drop-shadow, so the overlay can't double the
              // shadow during the fade. Keyed so each swap remounts and restarts the
              // fade (handles rapid clicks).
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
          </button>
        );
      })}
    </div>
  );
}
