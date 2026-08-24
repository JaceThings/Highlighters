import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { m, type MotionValue } from "framer-motion";
import { useBindMotion } from "./bindMotion.ts";
import { PEN_TOP_INSET, PEN_SIDE_INSET } from "./dock-zones.ts";
import { DOCK_H, INK_FADE_MS } from "./constants.ts";
import { Pen } from "./PenSvg.tsx";
import { PEN_OUTLINES } from "./pen-outlines.ts";
import { useOutlineTuning } from "./outline-tuning.ts";
import { hexToOklch, oklchToCss } from "./oklch.ts";
import { useNavModality } from "../../hooks/useNavModality.ts";
import { playMarkerSelect, primeMarkerAudio } from "../../lib/marker-audio.ts";
import type { PenTip } from "../../selection-style.tsx";

export const SVG_W = (27 * 43) / 26.1475;

export const FRAME_H = DOCK_H;
export const REST_TOP = FRAME_H - 95.45;
const GAP = 71 - SVG_W;
export const STEP = SVG_W + GAP;
export const SELECTED_RISE = 24;
const HOVER_RISE = 6;

const SCALE = SVG_W / 43;
const OUTLINE_W = 39 * SCALE;
const OUTLINE_LEFT = (SVG_W - OUTLINE_W) / 2;
const OUTLINE_LIFT = 4;

const OUTLINE_RISE = { duration: 0.24, ease: [0.2, 0, 0, 1] as const };
const OUTLINE_TRAVEL = { type: "spring", stiffness: 700, damping: 42 } as const;
const OUTLINE_FADE = { duration: 0.16 } as const;
const INSTANT = { duration: 0 } as const;

function MarkerOutline({ idx, selectedIdx, hoveredIdx }: { idx: number | null; selectedIdx: number; hoveredIdx: number | null }) {
  const { tips, preview } = useOutlineTuning();
  const previewIdx = preview ? PENS.findIndex((p) => p.id === preview) : null;
  const activeIdx = previewIdx ?? idx;
  const lastIdx = useRef(0);
  const slot = activeIdx ?? lastIdx.current;
  const focusedTip = PENS[slot].id;
  const risen = slot === selectedIdx;
  const liftY = risen ? -SELECTED_RISE : slot === hoveredIdx ? -HOVER_RISE : 0;
  const visible = activeIdx !== null;
  const prevVisible = useRef(false);
  const appearing = visible && !prevVisible.current;
  useEffect(() => {
    if (activeIdx !== null) lastIdx.current = activeIdx;
    prevVisible.current = visible;
  });
  return (
    <m.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-hidden"
      style={{ width: SVG_W, height: FRAME_H }}
      initial={false}
      animate={{ x: slot * STEP, opacity: visible ? 1 : 0 }}
      transition={{ x: appearing ? INSTANT : OUTLINE_TRAVEL, opacity: OUTLINE_FADE }}
    >
      <m.div
        className="absolute"
        style={{ left: OUTLINE_LEFT, top: REST_TOP - OUTLINE_LIFT, width: OUTLINE_W }}
        initial={false}
        animate={{ y: liftY }}
        transition={appearing ? INSTANT : OUTLINE_RISE}
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
              transition={appearing ? INSTANT : OUTLINE_FADE}
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

export function OpacityReadout({ pct }: { pct: number }) {
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

interface PenDef {
  id: PenTip;
  label: string;
}

const PENS: PenDef[] = [
  { id: "slant", label: "Chisel marker" },
  { id: "round", label: "Bullet marker" },
  { id: "fine", label: "Fine marker" },
];

export const PEN_ORDER: PenTip[] = PENS.map((p) => p.id);

const toPen = (hex: string) => oklchToCss(hexToOklch(hex));

export function MarkerRow({
  color,
  selected,
  opacityByPen,
  onSelect,
  onActivate,
  hideSelected,
}: {
  color: string;
  selected: PenTip;
  opacityByPen: Record<PenTip, number>;
  onSelect: (pen: PenTip) => void;
  onActivate: (button: HTMLButtonElement) => void;
  hideSelected?: MotionValue<number>;
}) {
  const [fadeOut, setFadeOut] = useState<{ color: string; key: number } | null>(null);
  const prevColor = useRef(color);
  const keyRef = useRef(0);
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

  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const keyboard = useNavModality();

  const selectedIdx = PENS.findIndex((p) => p.id === selected);

  const hitClip = `inset(${PEN_TOP_INSET}px ${PEN_SIDE_INSET}px 0px ${PEN_SIDE_INSET}px)`;

  const rowRef = useRef<HTMLDivElement>(null);
  const hideRef = useRef(hideSelected);
  hideRef.current = hideSelected;
  const applyLift = useCallback((el: HTMLElement | SVGElement) => {
    const m = hideRef.current?.get() ?? 0;
    el.querySelectorAll<HTMLElement>(".dock-lift-art").forEach((n) => {
      n.style.opacity = n.closest('button[aria-pressed="true"]') ? String(1 - m) : "1";
    });
  }, []);
  useBindMotion(rowRef, hideSelected ? [hideSelected] : [], applyLift);

  return (
    <div ref={rowRef} className="relative flex items-end" style={{ gap: GAP }} onPointerEnter={primeMarkerAudio}>
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
            onClick={(e) => {
              if (isSelected) {
                onActivate(e.currentTarget);
              } else {
                playMarkerSelect();
                onSelect(p.id);
              }
            }}
            onFocus={() => setFocusIdx(keyboard.current ? i : null)}
            onPointerEnter={() => setHoveredIdx(i)}
            onPointerLeave={() => setHoveredIdx((h) => (h === i ? null : h))}
            onBlur={(e) => {
              if (!e.relatedTarget?.closest(".dock-pen")) {
                setFocusIdx(null);
              }
            }}
            className="dock-pen relative block shrink-0 overflow-hidden"
            style={{ width: SVG_W, height: FRAME_H, clipPath: hitClip }}
          >
            <Pen
              tip={p.id}
              color={toPen(color)}
              width={SVG_W}
              className="dock-pen-art dock-lift-art"
              style={place}
            />
            {fadeOut && (
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
            <span
              aria-hidden
              className="dock-pen-art dock-lift-art pointer-events-none absolute"
              style={{ left: 0, top: REST_TOP, width: SVG_W }}
            >
              <OpacityReadout pct={pct} />
            </span>
          </button>
        );
      })}
      <MarkerOutline idx={focusIdx} selectedIdx={selectedIdx} hoveredIdx={hoveredIdx} />
    </div>
  );
}
