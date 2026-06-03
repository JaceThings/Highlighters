import { useEffect, useId, useLayoutEffect, useMemo, useRef } from "react";
import { useMotionValueEvent, type MotionValue } from "framer-motion";
import { makeZigzag, pointsUpTo, smoothStrokePath } from "./scribble-render.ts";

// The slider "fill", drawn as the Figma's hand-scribbled sawtooth instead of a solid bar. The
// scribble is a dense, tall, hand-jittered zigzag rendered as a SMOOTH stroke — a Catmull-Rom
// spline through the teeth (passes through every tip, so it keeps full amplitude). It's genuinely
// drawn: the path is rebuilt over the points UP TO the slider fraction, so it lays on as the
// value rises and retracts as it falls, with a round nib at the leading end. Each slider passes
// its own random seed, so every one is a uniquely hand-drawn line. The faint track background
// gets a wavy hand-drawn edge from a small feTurbulence displacement.

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const VIEW_W = 472;
const VIEW_H = 10;
const TRACK_BG = "rgba(126,117,108,0.12)";
const INK = "#7e756c";
const STROKE_W = 2.3;
const BG_WAVE = 1.3;

// The locked-in scribble shape; only the seed varies per slider.
const ZIG = { width: VIEW_W, height: VIEW_H, meanStep: 2.4, toothHeight: 8, jitterX: 1.2, jitterY: 0.55 };

export function ScribbleFill({
  seed,
  reported,
  min,
  max,
}: {
  /** Per-slider random seed → a unique hand-drawn zigzag. */
  seed: number;
  /** The slider's live value (already tweened/dragged). Drives how far the line is drawn. */
  reported: MotionValue<number>;
  min: number;
  max: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const waveId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pts = useMemo(() => makeZigzag({ ...ZIG, seed }), [seed]);
  const span = max - min === 0 ? 1 : max - min;

  // Redraw the smooth stroke up to the value fraction (drag + tween frames, and on seed change).
  const draw = (v: number) => {
    const el = pathRef.current;
    if (!el) return;
    const f = Math.max(0, Math.min(1, (v - min) / span));
    el.setAttribute("d", smoothStrokePath(pointsUpTo(pts, f)));
  };
  useIso(() => draw(reported.get()), [pts]); // eslint-disable-line react-hooks/exhaustive-deps
  useMotionValueEvent(reported, "change", draw);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden
      className="absolute inset-0 h-full w-full"
      style={{ overflow: "visible" }}
    >
      <defs>
        {/* Wavy hand-drawn edges on the track background only (the scribble stays crisp). */}
        <filter id={waveId} x="-2%" y="-50%" width="104%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.12" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={BG_WAVE} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={TRACK_BG} filter={`url(#${waveId})`} />
      <path ref={pathRef} fill="none" stroke={INK} strokeWidth={STROKE_W} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
