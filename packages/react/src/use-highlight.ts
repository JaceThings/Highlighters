import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { highlight } from "@highlighters/core";
import type { HighlightOptions, MarkHandle, Target } from "@highlighters/core";

const useIsoLayoutEffect = "window" in globalThis ? useLayoutEffect : useEffect;

export type HighlightTarget = React.RefObject<Element | null> | Target | null;

export interface HighlightRuntime {
  highlight(target: Target, options?: HighlightOptions, host?: HTMLElement | null): MarkHandle;
}

const HighlightRuntimeContext = createContext<HighlightRuntime>({ highlight });

export const HighlightRuntimeProvider = HighlightRuntimeContext.Provider;

function isRefObject(target: HighlightTarget): target is React.RefObject<Element | null> {
  const boxed = Object(target);
  return boxed === target && "current" in boxed;
}

function resolveTarget(target: HighlightTarget): Target | null {
  if (target == null) return null;
  return isRefObject(target) ? target.current : target;
}

export function useHighlight(
  target: HighlightTarget,
  options?: HighlightOptions,
  host?: HTMLElement | null,
): React.RefObject<MarkHandle | null> {
  const runtime = useContext(HighlightRuntimeContext);
  const handleRef = useRef<MarkHandle | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const optionsKey = JSON.stringify(options ?? null);

  useIsoLayoutEffect(() => {
    const resolved = resolveTarget(target);
    if (resolved != null && !handleRef.current) {
      handleRef.current = runtime.highlight(resolved, optionsRef.current, host ?? undefined);
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
      handleRef.current = runtime.highlight(resolved, optionsRef.current, host ?? undefined);
    }
  });

  useIsoLayoutEffect(() => {
    handleRef.current?.update(optionsRef.current ?? {});
  }, [optionsKey]);

  return handleRef;
}
