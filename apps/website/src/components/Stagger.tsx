import { createContext, use, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const EntranceCompleteContext = createContext(true);

export function useEntranceComplete(): boolean {
  return use(EntranceCompleteContext);
}

interface StaggerStyle extends CSSProperties {
  "--stagger": number;
}

interface StaggerProps {
  index: number;
  children: ReactNode;
  onComplete?: () => void;
}

export function Stagger({ index, children, onComplete }: StaggerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("stagger-in");
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => el.classList.add("stagger-in"));
    });
    const onEnd = (e: AnimationEvent) => {
      if (e.target !== el || e.animationName !== "stagger-fade-in") return;
      el.removeEventListener("animationend", onEnd);
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

  const staggerStyle: StaggerStyle = { "--stagger": index, opacity: 0 };

  return (
    <div ref={ref} className="stagger-item" style={staggerStyle}>
      <EntranceCompleteContext.Provider value={done}>{children}</EntranceCompleteContext.Provider>
    </div>
  );
}
