import { m, type MotionProps } from "framer-motion";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Default true so consumers outside a Stagger render their gated content immediately.
export const EntranceCompleteContext = createContext(true);

export function useEntranceComplete(): boolean {
  return use(EntranceCompleteContext);
}

interface StaggerProps {
  /** Stagger slot - child entrance is delayed by `index × STEP` seconds. */
  index: number;
  children: ReactNode;
  /** Fired once this block's entrance has landed (or immediately if skipped on a
   *  revisit). Tells the dock the last text block has arrived. */
  onComplete?: () => void;
}

const ENTRANCE_BLUR_PX = 4;

// Cascade timing anchor, captured once so later navigations skip the cascade.
const APP_MOUNT_MS = performance.now();

// Only skip after first paint - otherwise a slow bundle parse pushes `now` past the targets
// and suppresses the cascade. Double-rAF = the frame after first paint.
let hasFirstPainted = false;
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    hasFirstPainted = true;
  });
});

// 0.15s pause, 0.08s steps, 0.5s per item - a quick cascade that still reads as one.
const INITIAL_DELAY = 0.15;
const STEP = 0.08;
const DURATION = 0.5;
const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

interface UseStaggerEntranceOptions {
  /** Stagger slot - same semantics as `<Stagger index>`. */
  index: number;
  /** Hold at the faded state until true - gates the cascade on async readiness so a
   *  section doesn't fade in empty. Defaults to true. */
  ready?: boolean;
}

type EntranceMotionProps = Pick<MotionProps, "initial" | "animate" | "transition">;

/** Motion props for a cascade entrance - lets a component drive its own root element
 *  and gate on `ready` rather than wrap in a `<div>`. */
function useStaggerEntrance({
  index,
  ready = true,
}: UseStaggerEntranceOptions): EntranceMotionProps {
  // Lock readiness at mount so a late asset (false→true) still plays a fresh fade rather
  // than tripping the skip shortcut.
  const wasReadyAtMount = useRef(ready).current;

  const { skip, delay } = useMemo(() => {
    const targetMs = APP_MOUNT_MS + (INITIAL_DELAY + index * STEP) * 1000;
    const now = performance.now();
    return {
      skip: hasFirstPainted && targetMs <= now && wasReadyAtMount,
      delay: Math.max(0, (targetMs - now) / 1000),
    };
  }, [index, wasReadyAtMount, ready]);

  const initial = skip
    ? (false as const)
    : { opacity: 0, filter: `blur(${ENTRANCE_BLUR_PX}px)` };
  const animate = ready
    ? { opacity: 1, filter: "blur(0px)" }
    : { opacity: 0, filter: `blur(${ENTRANCE_BLUR_PX}px)` };
  const transition = skip
    ? { duration: 0 }
    : { duration: DURATION, ease: EASE, delay };

  return { initial, animate, transition };
}

export function Stagger({ index, children, onComplete }: StaggerProps) {
  const props = useStaggerEntrance({ index });
  // A skipped entrance (initial === false) has no animation to complete - seed `done` true.
  const skipped = props.initial === false;
  const [done, setDone] = useState(skipped);
  // It also never fires onAnimationComplete, so report it once on mount.
  useEffect(() => {
    if (skipped) onComplete?.();
  }, [skipped, onComplete]);
  return (
    <m.div
      {...props}
      onAnimationComplete={() => {
        setDone(true);
        onComplete?.();
      }}
    >
      <EntranceCompleteContext.Provider value={done}>
        {children}
      </EntranceCompleteContext.Provider>
    </m.div>
  );
}
