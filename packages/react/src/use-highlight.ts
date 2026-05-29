import { useEffect, useLayoutEffect, useRef } from "react";
import { highlight } from "@highlighters/core";
import type { HighlightOptions, MarkHandle, Target } from "@highlighters/core";

/**
 * `useLayoutEffect` on the client, `useEffect` during SSR — create the mark
 * synchronously after layout (no flash of un-highlighted text) without
 * triggering React's "useLayoutEffect does nothing on the server" warning.
 */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * The target a {@link useHighlight} call binds to: either a React ref to the
 * element to highlight, or any core {@link Target} (a selector, `Range`,
 * `Selection`, text query, or page target).
 */
export type HighlightTarget = React.RefObject<Element | null> | Target;

/** Narrow a {@link HighlightTarget} to a concrete core {@link Target}, or null. */
function resolveTarget(target: HighlightTarget): Target | null {
  if (target && typeof target === "object" && "current" in target) {
    return target.current ?? null;
  }
  return target as Target;
}

/**
 * React hook that applies a highlighter mark to a referenced element (or any
 * core {@link Target}) and keeps it in sync with `options`.
 *
 * The hook delegates entirely to the core `highlight()` pipeline (blueprint A1):
 * it creates the mark on mount, calls `handle.update()` when `options` change,
 * and `handle.remove()` on unmount — restoring the DOM and disconnecting every
 * observer (R9). It returns the live {@link MarkHandle} so callers can drive
 * `show`/`hide`/`isShowing` imperatively.
 *
 * @param target - A ref to the element to highlight, or a core `Target`.
 * @param options - Highlight options; re-applied via `update()` when they change.
 * @returns A ref holding the current {@link MarkHandle}, or `null` before mount.
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLParagraphElement>(null);
 * useHighlight(ref, { preset: "mild", color: "gold" });
 * return <p ref={ref}>Highlight me</p>;
 * ```
 */
export function useHighlight(
  target: HighlightTarget,
  options?: HighlightOptions,
): React.RefObject<MarkHandle | null> {
  const handleRef = useRef<MarkHandle | null>(null);

  // Read options through a ref so the setup effect doesn't re-run (and re-seed
  // the mark) on every render; the sync effect below feeds changes via update().
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Stable signature for the sync effect's deps. JSON.stringify is safe on the
  // bounded options object and avoids re-subscribing when a caller passes a
  // freshly-allocated literal with identical contents each render.
  const optionsKey = JSON.stringify(options ?? null);

  // Setup: create the mark on mount, tear it down on unmount or target change.
  useIsoLayoutEffect(() => {
    const resolved = resolveTarget(target);
    if (resolved == null) return;

    const handle = highlight(resolved, optionsRef.current);
    handleRef.current = handle;

    return () => {
      handle.remove();
      handleRef.current = null;
    };
    // The ref's `.current` identity is read at mount; for a RefObject the object
    // is stable, so we intentionally re-run only when the target object changes.
  }, [target]);

  // Sync: push option changes through the handle without re-seeding geometry
  // (R22d). Skipped on the same tick as setup since the handle was created with
  // the current options already.
  useIsoLayoutEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.update(optionsRef.current ?? {});
  }, [optionsKey]);

  return handleRef;
}
