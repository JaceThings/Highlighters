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

/** A template ref to the element, or any core {@link Target}. */
export type HighlightTarget = Ref<Element | null> | Target;

function resolveTarget(target: HighlightTarget): Target | null {
  const value = unref(target as MaybeRef<Element | null | Target>);
  return (value ?? null) as Target | null;
}

/**
 * Applies a highlighter mark to a template ref (or core {@link Target}) and keeps
 * it reactive to `options`. Returns a getter for the live {@link MarkHandle} so
 * callers can drive it imperatively.
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
      // Target appeared after setup — create it now.
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
  // Push option changes through update() without re-seeding geometry.
  if (options !== undefined) {
    watch(() => unref(options), sync, { deep: true });
  }

  onMounted(setup);
  onBeforeUnmount(cleanup);

  return () => handle;
}
