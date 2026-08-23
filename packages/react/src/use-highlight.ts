import { useEffect, useLayoutEffect, useRef } from "react";
import { highlight } from "@highlighters/core";
import type { HighlightOptions, MarkHandle, Target } from "@highlighters/core";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type HighlightTarget = React.RefObject<Element | null> | Target | null;

function resolveTarget(target: HighlightTarget): Target | null {
  if (target && typeof target === "object" && "current" in target) {
    return target.current ?? null;
  }
  return (target as Target) ?? null;
}

export function useHighlight(
  target: HighlightTarget,
  options?: HighlightOptions,
  host?: HTMLElement | null,
): React.RefObject<MarkHandle | null> {
  const handleRef = useRef<MarkHandle | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const optionsKey = JSON.stringify(options ?? null);

  useIsoLayoutEffect(() => {
    const resolved = resolveTarget(target);
    if (resolved != null && !handleRef.current) {
      handleRef.current = highlight(resolved, optionsRef.current, host ?? undefined);
    }
    return () => {
      handleRef.current?.remove();
      handleRef.current = null;
    };
  }, [target, host]);

  useIsoLayoutEffect(() => {
    if (handleRef.current) return;
    const resolved = resolveTarget(target);
    if (resolved != null) {
      handleRef.current = highlight(resolved, optionsRef.current, host ?? undefined);
    }
  });

  useIsoLayoutEffect(() => {
    handleRef.current?.update(optionsRef.current ?? {});
  }, [optionsKey]);

  return handleRef;
}
