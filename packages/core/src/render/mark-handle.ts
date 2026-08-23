import type {
  Disconnect,
  HighlightOptions,
  MarkHandle,
  RenderContext,
  Renderer,
  RendererTier,
  ResolvedOptions,
} from "../types.js";
import { mergeOptions, resolveOptions } from "../config/merge.js";
import { teardownContainer } from "./renderer.js";

export interface MarkHandleInit {
  ranges: Range[];
  options: ResolvedOptions;
  renderer: Renderer;
  container: HTMLElement;
  reflow: Disconnect;
  cleanup?: Disconnect[];
  replay?: () => void;
  retarget?: (lines: RenderContext["lines"]) => void;
  userOptions?: HighlightOptions;
  rebuild: (options: ResolvedOptions) => RenderContext;
}

export function createMarkHandle(init: MarkHandleInit): MarkHandle {
  const { renderer, container, reflow, rebuild, replay, retarget } = init;
  const cleanups = init.cleanup ? [...init.cleanup] : [];
  let userOptions: HighlightOptions = init.userOptions ? { ...init.userOptions } : {};
  let resolved = init.options;
  let showing = true;
  let removed = false;

  function rerender(): void {
    if (removed) return;
    const ctx = rebuild(resolved);
    renderer.update(ctx);
    retarget?.(ctx.lines);
    container.style.visibility = showing ? "" : "hidden";
  }

  return {
    get tier(): RendererTier {
      return renderer.tier;
    },

    show(): void {
      if (removed) return;
      showing = true;
      container.style.visibility = "";
      replay?.();
    },

    hide(): void {
      if (removed) return;
      showing = false;
      container.style.visibility = "hidden";
    },

    isShowing(): boolean {
      return showing && !removed;
    },

    update(opts: Partial<HighlightOptions>): void {
      if (removed) return;
      userOptions = mergeOptions(userOptions, opts);
      resolved = resolveOptions(userOptions);
      rerender();
    },

    remove(): void {
      if (removed) return;
      removed = true;
      showing = false;
      reflow();
      for (const dispose of cleanups) {
        try {
          dispose();
        } catch {
        }
      }
      cleanups.length = 0;
      renderer.unmount();
      teardownContainer(container);
    },
  };
}
