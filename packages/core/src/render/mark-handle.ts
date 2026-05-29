/**
 * The mark handle (blueprint R9 / V4) — the object every targeting call returns.
 *
 * A handle owns a single mounted mark: its renderer, its overlay container, its
 * reflow observer, and any extra cleanup (animation timers, mutation watchers,
 * selection listeners). It exposes `show`/`hide`/`isShowing` for visibility,
 * `update(opts)` to re-resolve options through the merge chain and re-render
 * without re-seeding stable geometry (R22d), and `remove()` to tear everything
 * down — renderer unmount, container teardown, and every observer/cleanup
 * disconnect — leaving the DOM byte-for-byte as it was before the mark (R9 / V4).
 *
 * The handle is deliberately renderer-agnostic and geometry-agnostic: it is given
 * the resolved options, the ranges, the renderer, the container, the reflow
 * disconnect, and a `rebuild` callback that recomputes per-line geometry from the
 * current layout. `update`/reflow both flow through `rebuild`, so there is one and
 * only one place that turns ranges + options into a {@link RenderContext}.
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

/**
 * Everything {@link createMarkHandle} needs to manage one mounted mark.
 */
export interface MarkHandleInit {
  /** The originating ranges (needed for re-render and Tier C painting). */
  ranges: Range[];
  /** Fully-resolved options for the current state of the mark. */
  options: ResolvedOptions;
  /** The renderer that owns this mark's paint. */
  renderer: Renderer;
  /** The positioned overlay host the renderer mounted into. */
  container: HTMLElement;
  /** The reflow observer's disconnect (rebuilds geometry on resize/font-load). */
  reflow: Disconnect;
  /** Extra teardown to run on `remove()` (animation, mutation watcher, …). */
  cleanup?: Disconnect[];
  /**
   * The original user-facing options that produced {@link options}. `update()`
   * accumulates further overrides on top of this so the merge chain stays
   * correct across successive updates (A7). Defaults to `{}`.
   */
  userOptions?: HighlightOptions;
  /**
   * Recompute the {@link RenderContext} for the current layout and options. The
   * handle calls this on every `update`/reflow so geometry is always derived from
   * a fresh read phase, and the renderer's `update` preserves stable regions
   * (R22d). Implemented by `highlight()` where the targeting pipeline lives.
   */
  rebuild: (options: ResolvedOptions) => RenderContext;
}

/**
 * Build a {@link MarkHandle} over a mounted renderer.
 *
 * @param init - The renderer, container, ranges, options, reflow disconnect,
 *   optional cleanups, and the geometry `rebuild` callback.
 * @returns A handle exposing `show`/`hide`/`update`/`remove`/`isShowing`/`tier`.
 */
export function createMarkHandle(init: MarkHandleInit): MarkHandle {
  const { renderer, container, reflow, rebuild } = init;
  const cleanups = init.cleanup ? [...init.cleanup] : [];
  // The full user-facing option state, accumulated across `update()` calls so the
  // merge chain stays correct: seeded from the options that produced this mark.
  let userOptions: HighlightOptions = init.userOptions ? { ...init.userOptions } : {};
  let resolved = init.options;
  let showing = true;
  let removed = false;

  /** Re-derive geometry and hand it to the renderer (the single render path). */
  function rerender(): void {
    if (removed) return;
    renderer.update(rebuild(resolved));
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
    },

    hide(): void {
      if (removed) return;
      showing = false;
      // Hide without tearing down geometry or observers (R9): the nodes stay
      // pooled so a later show() is instant and re-seeds nothing.
      container.style.visibility = "hidden";
    },

    isShowing(): boolean {
      return showing && !removed;
    },

    update(opts: Partial<HighlightOptions>): void {
      if (removed) return;
      // Accumulate user overrides, then re-resolve through the full merge chain
      // (defaults → preset → quality → colorant → user) so altitudes compose
      // correctly across successive updates (A7).
      userOptions = mergeOptions(userOptions, opts as HighlightOptions);
      resolved = resolveOptions(userOptions);
      rerender();
    },

    remove(): void {
      if (removed) return;
      removed = true;
      showing = false;
      // Order matters: stop incoming work first (reflow + cleanups), then
      // unmount the renderer, then strip the container — leaving zero residue.
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
