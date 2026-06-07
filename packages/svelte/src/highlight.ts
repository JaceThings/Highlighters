import { highlight as coreHighlight } from "@highlighters/core";
import type { HighlightOptions, MarkHandle } from "@highlighters/core";

export interface HighlightAction {
  update: (options?: HighlightOptions) => void;
  destroy: () => void;
}

/**
 * Svelte action that highlights an element's text content with a decorative overlay mark.
 *
 * @example
 * ```svelte
 * <script>
 *   import { highlight } from "@highlighters/svelte";
 * </script>
 * <p use:highlight={{ color: { palette: "mild", swatch: "yellow" } }}>Highlight me</p>
 * ```
 */
export function highlight(node: Element, options?: HighlightOptions): HighlightAction {
  let handle: MarkHandle = coreHighlight(node, options);

  return {
    update(next?: HighlightOptions): void {
      // Push through the live handle to preserve geometry.
      handle.update(next ?? {});
    },
    destroy(): void {
      handle.remove();
    },
  };
}
