import { highlight as coreHighlight } from "@highlighters/core";
import type { HighlightOptions, MarkHandle } from "@highlighters/core";

export interface HighlightAction {
  update: (options?: HighlightOptions) => void;
  destroy: () => void;
}

export function highlight(node: Element, options?: HighlightOptions): HighlightAction {
  let handle: MarkHandle = coreHighlight(node, options);

  return {
    update(next?: HighlightOptions): void {
      handle.update(next ?? {});
    },
    destroy(): void {
      handle.remove();
    },
  };
}
