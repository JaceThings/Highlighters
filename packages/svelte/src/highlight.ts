import { highlight as coreHighlight } from "@highlighters/core";
import type { HighlightOptions, MarkHandle } from "@highlighters/core";

/** The action return contract: `update` on param change, `destroy` on unmount. */
export interface HighlightAction {
  update: (options?: HighlightOptions) => void;
  destroy: () => void;
}

/**
 * Svelte action that highlights an element's text content with a realistic
 * highlighter mark. Delegates entirely to the core `highlight()` pipeline
 * (blueprint A1): the mark is created when the action attaches, re-applied via
 * `handle.update()` when the action parameter changes, and removed in
 * `destroy()` (R9). The element's text stays intact and selectable (R29) — the
 * mark is a decorative overlay.
 *
 * @param node - The element to highlight (the `use:` host).
 * @param options - Highlight options forwarded to the core pipeline.
 * @returns A {@link HighlightAction} with `update` / `destroy` lifecycle hooks.
 *
 * @example
 * ```svelte
 * <script>
 *   import { highlight } from "@highlighters/svelte";
 * </script>
 * <p use:highlight={{ preset: "mild", color: "gold" }}>Highlight me</p>
 * ```
 */
export function highlight(node: Element, options?: HighlightOptions): HighlightAction {
  let handle: MarkHandle = coreHighlight(node, options);

  return {
    update(next?: HighlightOptions): void {
      // Push the new options through the live handle so stable geometry is
      // preserved (R22d) rather than tearing down and re-seeding the mark.
      handle.update(next ?? {});
    },
    destroy(): void {
      handle.remove();
    },
  };
}
