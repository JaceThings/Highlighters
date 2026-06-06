/**
 * The mark handle: the object every targeting call returns.
 *
 * A handle owns a single mounted mark (renderer, overlay container, reflow observer, extra cleanup).
 * `update(opts)` re-resolves options through the merge chain and re-renders without re-seeding stable
 * geometry; `remove()` tears everything down, leaving the DOM byte-for-byte as before. Given a
 * `rebuild` callback, `update`/reflow both flow through it, so one place turns ranges + options into
 * a {@link RenderContext}.
 */

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
  /** The originating ranges (needed for re-render and Tier C painting). */
  ranges: Range[];
  options: ResolvedOptions;
  renderer: Renderer;
  container: HTMLElement;
  reflow: Disconnect;
  /** Extra teardown to run on `remove()` (animation, mutation watcher, …). */
  cleanup?: Disconnect[];
  /** Replay the draw-on entrance on an explicit `show()`. No-op if none. */
  replay?: () => void;
  /** Re-point the draw-on at freshly-built geometry on `update()`; without it a reshape leaves the old shape's clip cropping the new one. Never re-animates. */
  retarget?: (lines: RenderContext["lines"]) => void;
  /** The user-facing options that produced {@link options}; `update()` accumulates overrides on top. */
  userOptions?: HighlightOptions;
  /** Recompute the {@link RenderContext} for the current layout and options from a fresh read phase. */
  rebuild: (options: ResolvedOptions) => RenderContext;
}

/** Build a {@link MarkHandle} over a mounted renderer. */
export function createMarkHandle(init: MarkHandleInit): MarkHandle {
  const { renderer, container, reflow, rebuild, replay, retarget } = init;
  const cleanups = init.cleanup ? [...init.cleanup] : [];
  // Accumulated across `update()` calls so the merge chain stays correct.
  let userOptions: HighlightOptions = init.userOptions ? { ...init.userOptions } : {};
  let resolved = init.options;
  let showing = true;
  let removed = false;

  /** Re-derive geometry and hand it to the renderer (the single render path). */
  function rerender(): void {
    if (removed) return;
    const ctx = rebuild(resolved);
    renderer.update(ctx);
    // Keep the wrapper clip in step with the new geometry; a reshape would otherwise leave the old
    // shape's clip cropping the new one. Settled shows the new full clip, mid-draw picks it up. Never re-animates.
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
      // An explicit re-show replays the entrance; the initial mount animates directly, so this only fires on a later show().
      replay?.();
    },

    hide(): void {
      if (removed) return;
      showing = false;
      // Hide without tearing down geometry/observers: nodes stay pooled so a later show() is instant.
      container.style.visibility = "hidden";
    },

    isShowing(): boolean {
      return showing && !removed;
    },

    update(opts: Partial<HighlightOptions>): void {
      if (removed) return;
      // Re-resolve through the full merge chain so overrides compose correctly across successive updates.
      userOptions = mergeOptions(userOptions, opts as HighlightOptions);
      resolved = resolveOptions(userOptions);
      rerender();
    },

    remove(): void {
      if (removed) return;
      removed = true;
      showing = false;
      // Order matters: stop incoming work (reflow + cleanups), then unmount the renderer, then strip the container.
      reflow();
      for (const dispose of cleanups) {
        try {
          dispose();
        } catch {
          // A cleanup throwing must not strand the rest of teardown.
        }
      }
      cleanups.length = 0;
      renderer.unmount();
      teardownContainer(container);
    },
  };
}
