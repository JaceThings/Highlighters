import { createContext, use, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Default true so consumers outside a Stagger render gated content immediately.
export const EntranceCompleteContext = createContext(true);

export function useEntranceComplete(): boolean {
  return use(EntranceCompleteContext);
}

interface StaggerProps {
  /** Stagger slot - the entrance delay is `index` steps (see `.stagger-in` in global.css). */
  index: number;
  children: ReactNode;
  /** Fired once this block's entrance has landed. The last block's arrival cues the dock. */
  onComplete?: () => void;
}

// CSS drives the entrance (.stagger-in, delay computed from the --stagger index), not a JS timeline, so it
// can't drop a block for arriving late: every mount replays the full cascade (cold load, and PageFade's
// key-remount on nav). The block stays hidden until the class lands the frame after mount, restarting clean.
export function Stagger({ index, children, onComplete }: StaggerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("stagger-in");
    // Double rAF (the frame after mount) so removing then re-adding the class restarts the animation.
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => el.classList.add("stagger-in"));
    });
    const onEnd = (e: AnimationEvent) => {
      // Ignore animationend bubbling up from an animated child; only this block's own entrance counts.
      if (e.target !== el || e.animationName !== "stagger-fade-in") return;
      el.removeEventListener("animationend", onEnd);
      // Pin the landed state with .stagger-done, not the animation's `both` fill: the fill lingers a
      // filter:blur(0) layer that WebKit re-rasterizes soft on a later repaint (see global.css).
      el.classList.add("stagger-done");
      setDone(true);
      onCompleteRef.current?.();
    };
    el.addEventListener("animationend", onEnd);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      el.removeEventListener("animationend", onEnd);
    };
  }, []);

  return (
    <div ref={ref} className="stagger-item" style={{ "--stagger": index, opacity: 0 } as CSSProperties}>
      <EntranceCompleteContext.Provider value={done}>{children}</EntranceCompleteContext.Provider>
    </div>
  );
}
