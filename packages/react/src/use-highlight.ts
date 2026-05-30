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
 * The target a {@link useHighlight} call binds to: a React ref to the element to
 * highlight, any core {@link Target} (a selector, `Range`, `Selection`, text
 * query, or page target), or `null` (nothing yet — e.g. a deferred mount).
 */
export type HighlightTarget = React.RefObject<Element | null> | Target | null;

/** Narrow a {@link HighlightTarget} to a concrete core {@link Target}, or null. */
function resolveTarget(target: HighlightTarget): Target | null {
  if (target && typeof target === "object" && "current" in target) {
    return target.current ?? null;
  }
  return (target as Target) ?? null;
}

/**
 * React hook that applies a highlighter mark to a referenced element, a passed
 * DOM node, or any core {@link Target}, and keeps it in sync with `options`.
 *
 * The hook delegates entirely to the core `highlight()` pipeline (blueprint A1):
 * it creates the mark when the resolved target appears, calls `handle.update()`
 * when `options` change, and `handle.remove()` on unmount — restoring the DOM and
 * disconnecting every observer (R9). It returns the live {@link MarkHandle} so
 * callers can drive `show`/`hide`/`isShowing` imperatively.
 *
 * Two effects cover both ways a target can arrive: the setup effect re-creates the
 * mark whenever the resolved target *changes* (so passing the DOM node directly —
 * as `<Highlight>` does — recreates it on an element swap or a deferred mount),
 * and a recovery effect picks up a bare `RefObject` that populates *after* mount
 * (whose identity never changes, so the setup effect alone would miss it). The
 * setup effect owns the single teardown path, so the two never double-free.
 *
 * @param target - A ref to the element, a DOM node/core `Target`, or `null`.
 * @param options - Highlight options; re-applied via `update()` when they change.
 * @returns A ref holding the current {@link MarkHandle}, or `null` before mount.
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

  // Setup: (re)create the mark when the resolved target changes. Passing the node
  // itself makes node identity reactive here, so an `as`-element swap or a deferred
  // mount recreates on the right node. The cleanup is ALWAYS registered, so it
  // tears down whichever effect created the current handle (no leak, no double-free).
  useIsoLayoutEffect(() => {
    const resolved = resolveTarget(target);
    if (resolved != null && !handleRef.current) {
      handleRef.current = highlight(resolved, optionsRef.current);
    }
    return () => {
      handleRef.current?.remove();
      handleRef.current = null;
    };
  }, [target]);

  // Recovery: a bare RefObject can populate AFTER mount without changing identity,
  // so the setup effect (keyed on the stable ref) would never fire. Re-check after
  // each render and create the mark once the ref resolves; teardown stays with the
  // setup effect's cleanup, so this never double-frees.
  useIsoLayoutEffect(() => {
    if (handleRef.current) return;
    const resolved = resolveTarget(target);
    if (resolved != null) {
      handleRef.current = highlight(resolved, optionsRef.current);
    }
  });

  // Sync: push option changes through the handle without re-seeding geometry (R22d).
  useIsoLayoutEffect(() => {
    handleRef.current?.update(optionsRef.current ?? {});
  }, [optionsKey]);

  return handleRef;
}
