import { motion, useTransform, type MotionValue } from "framer-motion";
import getStroke from "perfect-freehand";
import { toPath } from "./freehand.ts";
import { SCRIBBLES } from "./scribbles.ts";

// The slider "fill", drawn as a hand-scribbled sawtooth instead of a solid bar. Each scribble
// (a Perfect-Freehand stroke over a zigzag, see scribbles.ts) spans the whole track, and a
// clip-inset reveals it left→right by the slider fraction — so it draws on as the value rises
// and retracts as it falls. A shared turbulence displacement adds a faint hand-drawn wobble.
//
// The four getStroke outlines are heavy, so they're built once and emitted ONCE into a shared
// <defs> ({@link ScribbleDefs}); every slider just <use>s its variation by id. That keeps the
// DOM to four paths total no matter how many sliders mount, and there's no per-frame getStroke
// — only the clip moves while dragging.

const STROKE = {
  size: 1.7,
  thinning: 0.16, // nearly uniform — a pen line, not a brush
  smoothing: 0.4,
  streamline: 0.3,
  simulatePressure: false,
  start: { cap: true, taper: 0 },
  end: { cap: true, taper: 0 },
  last: true,
};

// Common authoring box (matches scribbles.ts). preserveAspectRatio="none" stretches it to the
// track, so the teeth fill the track height and x maps linearly to the slider fraction.
const VIEW_BOX = "0 0 472 10";
const FILTER_ID = "docs-scribble-turb";
const pathId = (i: number) => `docs-scribble-${i}`;

// Outline `d` per variation, built once (getStroke on a dense zigzag is expensive). 1-decimal
// coords keep the long string compact.
let outlines: string[] | null = null;
function getOutlines(): string[] {
  if (!outlines) outlines = SCRIBBLES.map((s) => toPath(getStroke(s.pts, STROKE), 1));
  return outlines;
}

/**
 * Emits the four scribble outlines and the shared turbulence filter into one hidden SVG.
 * Render ONCE near the top of the docs page; every {@link ScribbleFill} references these by id.
 */
export function ScribbleDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <filter id={FILTER_ID} x="-4%" y="-50%" width="108%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.6 0.9" numOctaves="2" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {getOutlines().map((d, i) => (
          <path key={i} id={pathId(i)} d={d} />
        ))}
      </defs>
    </svg>
  );
}

export function ScribbleFill({
  index,
  reported,
  min,
  max,
  color = "#7e756c",
}: {
  /** Which of the four SCRIBBLES to draw. */
  index: number;
  /** The slider's live value (already tweened/dragged). Drives how much is revealed. */
  reported: MotionValue<number>;
  min: number;
  max: number;
  color?: string;
}) {
  const span = max - min === 0 ? 1 : max - min;
  const clipPath = useTransform(reported, (v) => {
    const pct = Math.max(0, Math.min(1, (v - min) / span)) * 100;
    return `inset(-30% ${(100 - pct).toFixed(2)}% -30% 0)`;
  });

  return (
    <motion.svg
      viewBox={VIEW_BOX}
      preserveAspectRatio="none"
      aria-hidden
      className="absolute inset-0 h-full w-full"
      style={{ clipPath, overflow: "visible" }}
    >
      <use href={`#${pathId(index)}`} fill={color} filter={`url(#${FILTER_ID})`} />
    </motion.svg>
  );
}
