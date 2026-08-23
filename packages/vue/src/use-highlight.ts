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

export type HighlightTarget = Ref<Element | null> | Target;

function isElementRef(target: HighlightTarget): target is Ref<Element | null> {
  const boxed = Object(target);
  return boxed === target && "value" in boxed;
}

function resolveTarget(target: HighlightTarget): Target | null {
  if (!isElementRef(target)) return target;
  return target.value;
}

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
      setup();
      return;
    }
    handle.update(options ? (unref(options) ?? {}) : {});
  }

  function cleanup(): void {
    handle?.remove();
    handle = null;
  }

  watch(() => resolveTarget(target), setup);
  if (options !== undefined) {
    watch(() => unref(options), sync, { deep: true });
  }

  onMounted(setup);
  onBeforeUnmount(cleanup);

  return () => handle;
}
