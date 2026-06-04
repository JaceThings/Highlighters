/**
 * The mark handle (blueprint R9 / V4) - the object every targeting call returns.
 *
 * A handle owns a single mounted mark: its renderer, overlay container, reflow
 * observer, and any extra cleanup. `update(opts)` re-resolves options through the
 * merge chain and re-renders without re-seeding stable geometry (R22d); `remove()`
 * tears everything down, leaving the DOM byte-for-byte as before (R9 / V4).
 *
 * Renderer- and geometry-agnostic: given a `rebuild` callback that recomputes
 * per-line geometry from the current layout, `update`/reflow both flow through it,
 * so one and only one place turns ranges + options into a {@link RenderContext}.
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
  /** Replay the draw-on entrance on an explicit `show()` (R24). No-op if none. */
  replay?: () => void;
  /**
   * Re-point the draw-on at freshly-built geometry on `update()`. Without it, an
   * option change that reshapes the mark (e.g. a tip swap) updates the ink's clip but
   * leaves the previous shape's clip on the wrapper, which then crops the new one.
   * No-op if none; never re-animates (R22).
   */
  retarget?: (lines: RenderContext["lines"]) => void;
  /**
   * The user-facing options that produced {@link options}. `update()` accumulates
   * overrides on top so the merge chain stays correct across updates (A7).
   */
  userOptions?: HighlightOptions;
  /**
   * Recompute the {@link RenderContext} for the current layout and options, from a
   * fresh read phase. Implemented by `highlight()` where the pipeline lives.
   */
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
    // Keep the draw-on's wrapper clip in step with the new geometry; otherwise an
    // option change that reshapes the mark (a tip swap) leaves the previous shape's
    // clip on the wrapper, cropping the new one. Settled -> shows the new full clip;
    // mid-draw -> the frame loop picks up the new geometry. Never re-animates (R22).
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
      // An explicit re-show replays the entrance (R24); the initial mount animates
      // via applyDrawOn directly, so this only fires on a later show().
      replay?.();
    },

    hide(): void {
      if (removed) return;
      showing = false;
      // Hide without tearing down geometry/observers (R9): nodes stay pooled so a
      // later show() is instant and re-seeds nothing.
      container.style.visibility = "hidden";
    },

    isShowing(): boolean {
      return showing && !removed;
    },

    update(opts: Partial<HighlightOptions>): void {
      if (removed) return;
      // Re-resolve through the full merge chain (defaults → preset → user) so
      // altitudes compose correctly across successive updates (A7).
      userOptions = mergeOptions(userOptions, opts as HighlightOptions);
      resolved = resolveOptions(userOptions);
      rerender();
    },

    remove(): void {
      if (removed) return;
      removed = true;
      showing = false;
      // Order matters: stop incoming work first (reflow + cleanups), then unmount
      // the renderer, then strip the container - leaving zero residue.
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
