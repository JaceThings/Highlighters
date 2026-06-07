import { useEffect, useId, useLayoutEffect, useMemo, useRef } from "react";
import { useMotionValueEvent, type MotionValue } from "framer-motion";
import { makeZigzag, pointsUpTo, pointsBetween, smoothStrokePath } from "./scribble-render.ts";
import { IS_WEBKIT } from "./is-webkit.ts";

// The slider fill as a hand-scribbled sawtooth: the path is rebuilt over points up to the slider
// fraction, so it lays on as the value rises and retracts as it falls. Per-slider seed = a unique line.

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const VIEW_W = 472;
const VIEW_H = 10;
const TRACK_BG = "rgba(126,117,108,0.12)";
const INK = "#7e756c";
const PEN_BLUE = "#91b4ff";
const STROKE_W = 2.3;
const BG_WAVE = 1.3;

// Locked-in scribble shape; only the seed varies per slider.
const ZIG = { width: VIEW_W, height: VIEW_H, meanStep: 2.4, toothHeight: 8, jitterX: 1.2, jitterY: 0.55 };

export function ScribbleFill({
  seed,
  reported,
  min,
  max,
  floor,
}: {
  /** Per-slider random seed -> a unique hand-drawn zigzag. */
  seed: number;
  /** The slider's live value (tweened/dragged); drives how far the line is drawn. */
  reported: MotionValue<number>;
  min: number;
  max: number;
  /** Enforced minimum. When set, a static blue pen squiggle marks 0 -> floor. */
  floor?: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const floorRef = useRef<SVGPathElement>(null);
  const waveId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pts = useMemo(() => makeZigzag({ ...ZIG, seed }), [seed]);
  // Differently-seeded scribble so the floor reads as its own pen stroke.
  const floorPts = useMemo(() => makeZigzag({ ...ZIG, seed: seed + 9973 }), [seed]);
  const span = max - min === 0 ? 1 : max - min;
  const floorFrac = floor != null ? Math.max(0, Math.min(1, (floor - min) / span)) : 0;

  // Redraw the smooth stroke up to the value fraction. With a floor, start at floorFrac so the brown
  // line begins where the blue floor squiggle ends instead of overlapping it.
  const draw = (v: number) => {
    const el = pathRef.current;
    if (!el) return;
    const f = Math.max(0, Math.min(1, (v - min) / span));
    const seg = floor != null ? pointsBetween(pts, floorFrac, f) : pointsUpTo(pts, f);
    el.setAttribute("d", smoothStrokePath(seg));
  };
  useIso(() => {
    draw(reported.get());
    // The floor squiggle is static: drawn once, redrawn only if it changes.
    if (floor != null && floorRef.current) {
      floorRef.current.setAttribute("d", smoothStrokePath(pointsUpTo(floorPts, floorFrac)));
    }
  }, [pts, floorPts, floorFrac]); // eslint-disable-line react-hooks/exhaustive-deps
  useMotionValueEvent(reported, "change", draw);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden
      className="absolute inset-0 h-full w-full"
      style={{ overflow: "visible" }}
    >
      {/* Wavy edges on the track background only; skipped on WebKit (slow turbulence -> plain bar). */}
      {!IS_WEBKIT && (
        <defs>
          <filter id={waveId} x="-2%" y="-50%" width="104%" height="200%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04 0.12" numOctaves="2" seed="11" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={BG_WAVE} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      )}
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={TRACK_BG} filter={IS_WEBKIT ? undefined : `url(#${waveId})`} />
      <path ref={pathRef} fill="none" stroke={INK} strokeWidth={STROKE_W} strokeLinecap="round" strokeLinejoin="round" />
      {floor != null ? (
        <path ref={floorRef} fill="none" stroke={PEN_BLUE} strokeWidth={STROKE_W} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}
