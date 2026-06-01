/**
 * Live selection swipe-velocity tracking (R17, speed-aware ink deposit).
 *
 * THE MODEL — a spatial velocity field. As the user drags a selection, we sample
 * the focus caret's pixel position over time and store `{x, y, v}` samples in the
 * SAME container-local px space the line geometry is built in (see
 * {@link rangesToLineRects} / `buildLines`). Because a live drag never reflows
 * between sampling and painting, a line can look up the swipe speed at any point
 * along its own band by spatial position — exactly, with no character-offset
 * mapping. That alignment is the whole trick (a char/progress model would need a
 * brittle per-glyph layer that breaks on ligatures, bidi, and wrapping).
 *
 * This module is imported ONLY by `highlightSelection` and runs ONLY during an
 * active fine-pointer drag, so the static `highlight()` path and SSR never touch
 * a clock or the DOM through it — the determinism guarantee is structural.
 *
 * Output is a {@link LineSpeedProfile} per line (pure data), injected into
 * `buildMarkGeometry`; `undefined` when a line has no samples, so callers cleanly
 * fall back to the exact legacy geometry.
 */

import { clamp } from "../internal/math.js";
import type { LineSpeedProfile, ResolvedSpeedDynamics } from "../types.js";

/** One focus-caret reading in container-local px, with its smoothed speed (px/ms). */
interface Sample {
  x: number;
  y: number;
  v: number;
}

/** Hard cap on retained samples; on overflow we drop the oldest half. */
const MAX_SAMPLES = 500;
/** Two samples within this px in both axes are treated as co-located (last-pass dedup). */
const DEDUP_PX = 2;
/** Only the most-recent few samples are scanned for a co-located duplicate. */
const DEDUP_LOOKBACK = 8;
/** Floor on the inter-sample interval so a coalesced/instant event can't divide by ~0. */
const DT_FLOOR_MS = 1;

/** A node+offset caret position in container-local px, or `null` if unmeasurable. */
function caretLocal(
  node: Node,
  offset: number,
  originLeft: number,
  originTop: number,
): { x: number; y: number } | null {
  try {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    let rect: DOMRect | undefined = range.getClientRects()[0] ?? range.getBoundingClientRect();
    // A collapsed caret can measure 0×0 (start of a node, empty wrapper). Fall back
    // to the single char ending AT the offset, whose right edge sits at the caret.
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const len = node.nodeType === 3 ? (node as Text).length : node.childNodes.length;
      const start = Math.max(0, Math.min(offset, len) - 1);
      const end = Math.min(len, start + 1);
      if (end > start) {
        range.setStart(node, start);
        range.setEnd(node, end);
        rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      }
    }
    // Still fully empty (a caret has height even when width is 0) → unmeasurable;
    // skip rather than plant a bogus (0,0) sample that would corrupt the velocity.
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    // Right edge tracks the focus side for both the caret and the 1-char fallback;
    // vertical centre lands the sample squarely inside the line's y-band.
    return { x: rect.right - originLeft, y: (rect.top + rect.bottom) / 2 - originTop };
  } catch {
    // Detached node, cross-origin, or a host without Range support → no sample.
    return null;
  }
}

/**
 * Accumulates a spatial velocity field for the current drag gesture and serves
 * per-line speed profiles. One instance lives for the lifetime of a
 * {@link highlightSelection} handle; {@link reset} clears it between gestures.
 */
export class SelectionVelocityTracker {
  private samples: Sample[] = [];
  private prevX = 0;
  private prevY = 0;
  private prevT = 0;
  private hasPrev = false;
  private ema = 0;

  /** Drop all samples and gesture state (a new drag, or handle teardown). */
  reset(): void {
    this.samples = [];
    this.hasPrev = false;
    this.ema = 0;
  }

  /** Whether any velocity has been sampled for the current gesture. */
  hasData(): boolean {
    return this.samples.length > 0;
  }

  /**
   * Record one focus-caret reading for `selection`. `now` is a monotonic ms
   * timestamp (the caller passes `performance.now()`); `smoothing` is the EMA
   * weight on the newest sample. No-ops if the caret can't be measured. One rect
   * read per call — the caller resets the field at the start of each gesture
   * (pointerdown), so a fresh drag never inherits the previous gesture's speeds.
   */
  recordSample(
    selection: Selection,
    originLeft: number,
    originTop: number,
    now: number,
    smoothing: number,
  ): void {
    const { focusNode, focusOffset } = selection;
    if (!focusNode) return;

    const pos = caretLocal(focusNode, focusOffset, originLeft, originTop);
    if (!pos) return;

    if (!this.hasPrev) {
      // First reading of the gesture: seed position/time only. We do NOT store a
      // sample yet — velocity needs two readings, and a fake 0-speed point here
      // would read as "wet" at the band's start and pin the line's peak deposit
      // at full (defeating the overall dimming of a uniformly fast swipe).
      this.prevX = pos.x;
      this.prevY = pos.y;
      this.prevT = now;
      this.hasPrev = true;
      return;
    }

    const dt = Math.max(DT_FLOOR_MS, now - this.prevT);
    const dist = Math.hypot(pos.x - this.prevX, pos.y - this.prevY);
    const instant = dist / dt;
    const a = clamp(smoothing, 0, 1);
    this.ema = this.hasData() ? (1 - a) * this.ema + a * instant : instant;
    this.prevX = pos.x;
    this.prevY = pos.y;
    this.prevT = now;
    this.push({ x: pos.x, y: pos.y, v: this.ema });
  }

  /** Append a sample, collapsing a co-located recent one (last-pass on backtrack). */
  private push(sample: Sample): void {
    const from = Math.max(0, this.samples.length - DEDUP_LOOKBACK);
    for (let i = this.samples.length - 1; i >= from; i--) {
      const o = this.samples[i];
      if (Math.abs(o.x - sample.x) <= DEDUP_PX && Math.abs(o.y - sample.y) <= DEDUP_PX) {
        this.samples[i] = sample;
        return;
      }
    }
    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples = this.samples.slice(this.samples.length - Math.floor(MAX_SAMPLES / 2));
    }
  }

  /**
   * Build the {@link LineSpeedProfile} for a line box (container-local px), or
   * `undefined` when no sample fell on this line — in which case the caller paints
   * the exact legacy geometry. `sd` supplies the calibration + strength.
   */
  profileForLine(
    line: { top: number; height: number; left: number; width: number },
    sd: ResolvedSpeedDynamics,
  ): LineSpeedProfile | undefined {
    const top = line.top;
    const bottom = line.top + line.height;
    const band: Sample[] = [];
    for (const s of this.samples) {
      if (s.y >= top && s.y < bottom) band.push(s);
    }
    if (band.length === 0) return undefined;

    // Deceleration uses TEMPORAL order (band is still in insertion order here): a
    // swipe that slowed as it crossed this line pools more ink at its end. Computed
    // before the x-sort below so it's correct for backward (right-to-left) drags too.
    const vTemporalStart = band[0].v;
    const vTemporalEnd = band[band.length - 1].v;

    band.sort((p, q) => p.x - q.x);

    const left = line.left;
    const width = Math.max(1, line.width);
    const denom = Math.max(1e-3, sd.fastSpeed - sd.slowSpeed);
    const norm = (v: number): number => clamp((v - sd.slowSpeed) / denom, 0, 1);
    // deposit: 1 (wet) at/below slowSpeed → minDeposit (dry) at/above fastSpeed,
    // scaled by sensitivity so 0 = no effect.
    const deposit = (v: number): number => 1 - sd.sensitivity * norm(v) * (1 - sd.minDeposit);

    const vAtX = (absX: number): number => {
      const first = band[0];
      const last = band[band.length - 1];
      if (absX <= first.x) return first.v;
      if (absX >= last.x) return last.v;
      for (let i = 1; i < band.length; i++) {
        const b = band[i];
        if (b.x >= absX) {
          const a = band[i - 1];
          const t = (absX - a.x) / Math.max(1e-6, b.x - a.x);
          return a.v + t * (b.v - a.v);
        }
      }
      return last.v;
    };

    let sum = 0;
    for (const s of band) sum += s.v;
    const meanNorm = norm(sum / band.length);

    const decel = clamp((vTemporalStart - vTemporalEnd) / Math.max(1e-3, vTemporalStart), 0, 1);

    return {
      depositAt: (f: number): number => deposit(vAtX(left + clamp(f, 0, 1) * width)),
      meanNorm,
      decel,
    };
  }
}
