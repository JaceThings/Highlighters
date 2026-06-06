/**
 * Live selection swipe-velocity tracking for speed-aware ink deposit.
 *
 * A spatial velocity field: focus-caret `{x, y, v}` samples in the same container-local px space the
 * line geometry uses. A live drag never reflows between sampling and painting, so a line looks up the
 * swipe speed by spatial position (no brittle per-glyph character-offset mapping). Used only by
 * `highlightSelection` during an active fine-pointer drag. Output is a {@link LineSpeedProfile} per
 * line, or `undefined` when a line has no samples.
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
    // A collapsed caret can measure 0x0; fall back to the single char ending at the offset, whose right edge sits at the caret.
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
    // Still empty: unmeasurable, skip rather than plant a bogus (0,0) sample that corrupts the velocity.
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    // Right edge tracks the focus side; vertical centre lands inside the y-band.
    return { x: rect.right - originLeft, y: (rect.top + rect.bottom) / 2 - originTop };
  } catch {
    // Detached node, cross-origin, or no Range support: no sample.
    return null;
  }
}

/** Accumulates the drag's spatial velocity field and serves per-line speed profiles. {@link reset} clears it between gestures. */
export class SelectionVelocityTracker {
  private samples: Sample[] = [];
  private prevX = 0;
  private prevY = 0;
  private prevT = 0;
  private hasPrev = false;
  private ema = 0;

  reset(): void {
    this.samples = [];
    this.hasPrev = false;
    this.ema = 0;
  }

  hasData(): boolean {
    return this.samples.length > 0;
  }

  /** Record one focus-caret reading. `now` is a monotonic ms timestamp; `smoothing` is the EMA weight on the newest sample. No-op if unmeasurable. */
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
      // First reading seeds position/time only: a fake 0-speed sample would read "wet" at the band start and pin peak deposit, defeating a fast swipe's dimming.
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

  /** Append a sample, collapsing a co-located recent one. */
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

  /** Build the {@link LineSpeedProfile} for a line box (container-local px), or `undefined` when no sample fell on this line. */
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

    // Deceleration uses temporal (insertion) order so it stays correct for backward drags; must be read before the x-sort below.
    const vTemporalStart = band[0].v;
    const vTemporalEnd = band[band.length - 1].v;

    band.sort((p, q) => p.x - q.x);

    const left = line.left;
    const width = Math.max(1, line.width);
    const denom = Math.max(1e-3, sd.fastSpeed - sd.slowSpeed);
    const norm = (v: number): number => clamp((v - sd.slowSpeed) / denom, 0, 1);
    // 1 (wet) at/below slowSpeed to minDeposit (dry) at/above fastSpeed, scaled by sensitivity (0 = no effect).
    const deposit = (v: number): number => 1 - sd.sensitivity * norm(v) * (1 - sd.minDeposit);

    // `band` is sorted by x; binary-search the bracketing pair to keep this O(log n) on the repaint path.
    const vAtX = (absX: number): number => {
      const first = band[0];
      const last = band[band.length - 1];
      if (absX <= first.x) return first.v;
      if (absX >= last.x) return last.v;
      let lo = 0;
      let hi = band.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (band[mid].x <= absX) lo = mid;
        else hi = mid;
      }
      const a = band[lo];
      const b = band[hi];
      const t = (absX - a.x) / Math.max(1e-6, b.x - a.x);
      return a.v + t * (b.v - a.v);
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
