import {
  watch,
  onMounted,
  onBeforeUnmount,
  unref,
  type Ref,
  type MaybeRef,
} from "vue";
import { highlight } from "@highlighters/core";
import type { HighlightOptions, MarkHandle, Target } from "@highlighters/core";

/**
 * The target a {@link useHighlight} call binds to: either a template ref to the
 * element to highlight, or any core {@link Target}.
 */
export type HighlightTarget = Ref<Element | null> | Target;

/** Narrow a {@link HighlightTarget} to a concrete core {@link Target}, or null. */
function resolveTarget(target: HighlightTarget): Target | null {
  const value = unref(target as MaybeRef<Element | null | Target>);
  return (value ?? null) as Target | null;
}

/**
 * Vue composable that applies a highlighter mark to a template ref (or any core
 * {@link Target}) and keeps it reactive to `options`.
 *
 * Delegates entirely to the core `highlight()` pipeline (blueprint A1): the mark
 * is created in `onMounted`, re-applied via `handle.update()` when the target or
 * `options` change, and torn down in `onBeforeUnmount` (R9). Returns a getter
 * for the live {@link MarkHandle} so callers can drive it imperatively.
 *
 * @param target - A template ref to the element, or a core `Target`.
 * @param options - Reactive highlight options.
 * @returns A function returning the current {@link MarkHandle}, or `null`.
 *
 * @example
 * ```vue
 * <script setup>
 * import { ref } from "vue";
 * import { useHighlight } from "@highlighters/vue";
 * const el = ref(null);
 * useHighlight(el, { preset: "mild" });
 * </script>
 * <template><p ref="el">Highlight me</p></template>
 * ```
 */
export function useHighlight(
  target: HighlightTarget,
  options?: MaybeRef<HighlightOptions | undefined>,
): () => MarkHandle | null {
  let handle: MarkHandle | null = null;

  function setup(): void {
    cleanup();
    const resolved = resolveTarget(target);
    if (resolved == null) return;
    handle = highlight(resolved, options ? unref(options) : undefined);
  }

  function sync(): void {
    if (!handle) {
      // No mark yet (target appeared after setup) — create it now.
      setup();
      return;
    }
    handle.update(options ? (unref(options) ?? {}) : {});
  }

  function cleanup(): void {
    handle?.remove();
    handle = null;
  }

  // Recreate when the bound element changes (a ref reassigned to a new node).
  watch(() => resolveTarget(target), setup);
  // Push option changes through update() without re-seeding stable geometry.
  if (options !== undefined) {
    watch(() => unref(options), sync, { deep: true });
  }

  onMounted(setup);
  onBeforeUnmount(cleanup);

  return () => handle;
}
