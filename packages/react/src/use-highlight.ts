import { useEffect, useLayoutEffect, useRef } from "react";
import { highlight } from "@highlighters/core";
import type { HighlightOptions, MarkHandle, Target } from "@highlighters/core";

// useLayoutEffect on the client, useEffect during SSR — runs after layout (no
// flash of un-highlighted text) without React's "useLayoutEffect does nothing on
// the server" warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** A React ref, any core {@link Target}, or `null`. */
export type HighlightTarget = React.RefObject<Element | null> | Target | null;

function resolveTarget(target: HighlightTarget): Target | null {
  if (target && typeof target === "object" && "current" in target) {
    return target.current ?? null;
  }
  return (target as Target) ?? null;
}

/**
 * Applies a highlighter mark to a ref, DOM node, or core {@link Target}, keeping
 * it in sync with `options`. Returns the live {@link MarkHandle} so callers can
 * drive `show`/`hide`/`isShowing` imperatively.
 *
 * @param target - A ref to the element, a DOM node/core `Target`, or `null`.
 * @param options - Re-applied via `update()` when they change.
 * @param host - Positioned element to mount the overlay inside (instead of the
 *   body). Changing it re-creates the mark.
 */
export function useHighlight(
  target: HighlightTarget,
  options?: HighlightOptions,
  host?: HTMLElement | null,
): React.RefObject<MarkHandle | null> {
  const handleRef = useRef<MarkHandle | null>(null);

  // Read options through a ref so the setup effect doesn't re-run (and re-seed
  // the mark) on every render; the sync effect feeds changes via update().
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Stable dep for the sync effect: avoids re-subscribing when a caller passes a
  // freshly-allocated literal with identical contents each render.
  const optionsKey = JSON.stringify(options ?? null);

  // Setup: (re)create the mark when the resolved target changes — passing the node
  // itself (as <Highlight> does) makes that reactive, covering `as`-swaps and
  // deferred mounts. Cleanup is always registered, so it tears down whichever
  // effect created the current handle.
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

  // Recovery: a bare RefObject can populate after mount without changing identity,
  // so the setup effect (keyed on the ref) never fires. Re-check each render;
  // teardown stays with the setup effect's cleanup, so no double-free.
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
