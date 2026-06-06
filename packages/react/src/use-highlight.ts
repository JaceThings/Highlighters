import { useEffect, useLayoutEffect, useRef } from "react";
import { highlight } from "@highlighters/core";
import type { HighlightOptions, MarkHandle, Target } from "@highlighters/core";

// useLayoutEffect on the client, useEffect during SSR to avoid React's server warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** A React ref, any core {@link Target}, or `null`. */
export type HighlightTarget = React.RefObject<Element | null> | Target | null;

function resolveTarget(target: HighlightTarget): Target | null {
  if (target && typeof target === "object" && "current" in target) {
    return target.current ?? null;
  }
  return (target as Target) ?? null;
}

/** Applies a highlighter mark to a ref, DOM node, or core {@link Target}, returning its live {@link MarkHandle}. */
export function useHighlight(
  target: HighlightTarget,
  options?: HighlightOptions,
  host?: HTMLElement | null,
): React.RefObject<MarkHandle | null> {
  const handleRef = useRef<MarkHandle | null>(null);

  // Read options through a ref so the setup effect doesn't re-seed the mark each render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Stable dep so a fresh literal with identical contents doesn't re-subscribe.
  const optionsKey = JSON.stringify(options ?? null);

  // (Re)create the mark when the resolved target changes.
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

  // A bare RefObject can populate after mount without changing identity, so re-check each render.
  useIsoLayoutEffect(() => {
    if (handleRef.current) return;
    const resolved = resolveTarget(target);
    if (resolved != null) {
      handleRef.current = highlight(resolved, optionsRef.current, host ?? undefined);
    }
  });

  // Sync option changes through the handle without re-seeding geometry.
  useIsoLayoutEffect(() => {
    handleRef.current?.update(optionsRef.current ?? {});
  }, [optionsKey]);

  return handleRef;
}
