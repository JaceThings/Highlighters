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

// The entrance is a CSS animation keyed off the --stagger index (`.stagger-in`), not a JS timeline: CSS
// computes each block's delay from its index, so the cascade always plays in full on every mount (full
// load AND navigation, which remounts these via PageFade's key) and can never drop a block for arriving
// late. The block starts hidden until the class is added the frame after mount, so it restarts cleanly.
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
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => el.classList.add("stagger-in"));
    });
    const onEnd = (e: AnimationEvent) => {
      // Ignore animationend bubbling up from an animated child; only this block's own entrance counts.
      if (e.target !== el || e.animationName !== "stagger-fade-in") return;
      el.removeEventListener("animationend", onEnd);
      el.style.opacity = "1";
      el.style.removeProperty("filter");
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
