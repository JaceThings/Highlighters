// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SelectionVelocityTracker } from "../src/targeting/velocity.js";
import type { ResolvedSpeedDynamics } from "../src/types.js";

/**
 * Speed dynamics measured deterministically. We stub `document.createRange` so a
 * caret's x equals the (set) offset and its y is fixed to one line band — letting
 * us script a swipe as `(offset, time)` samples and assert the resulting deposit.
 * `smoothing: 1` makes the EMA track the raw instantaneous speed (no lag), so the
 * assertions are exact.
 */
const SD: ResolvedSpeedDynamics = {
  enabled: true,
  sensitivity: 1,
  slowSpeed: 0,
  fastSpeed: 10,
  minDeposit: 0.2,
  smoothing: 1,
  resolution: 12,
  dryoutBoost: 0.7,
  streakBoost: 0.3,
  featherReduce: 0.5,
  poolBoost: 0.6,
};

const LINE = { top: 50, height: 16, left: 0, width: 300 };

function node(): Text {
  return { nodeType: 3, length: 10000 } as unknown as Text;
}
function selection(n: Text, anchorOffset: number, focusOffset: number): Selection {
  return {
    anchorNode: n,
    anchorOffset,
    focusNode: n,
    focusOffset,
    isCollapsed: false,
  } as unknown as Selection;
}

let original: typeof document.createRange;
beforeEach(() => {
  original = document.createRange;
  // Caret x === the offset passed to setStart; y fixed inside LINE's band.
  (document as unknown as { createRange: () => Range }).createRange = (): Range => {
    let startOffset = 0;
    const rect = (): DOMRect =>
      ({
        left: startOffset,
        right: startOffset,
        top: LINE.top,
        bottom: LINE.top + LINE.height,
        width: 0,
        height: LINE.height,
      }) as DOMRect;
    return {
      setStart: (_n: Node, o: number) => {
        startOffset = o;
      },
      setEnd: () => {},
      collapse: () => {},
      getClientRects: () => [rect()] as unknown as DOMRectList,
      getBoundingClientRect: () => rect(),
    } as unknown as Range;
  };
});
afterEach(() => {
  document.createRange = original;
});

/** Record a scripted swipe of `[offset, timeMs]` steps (anchor fixed at 0). */
function swipe(tracker: SelectionVelocityTracker, steps: [number, number][]): void {
  const n = node();
  for (const [offset, t] of steps) {
    tracker.recordSample(selection(n, 0, offset), 0, 0, t, SD.smoothing);
  }
}

describe("SelectionVelocityTracker", () => {
  it("floors dt so an instant jump yields a finite (dry) deposit, not Infinity", () => {
    const t = new SelectionVelocityTracker();
    // Two samples at the SAME timestamp → dt floored to 1ms, not a divide-by-zero.
    swipe(t, [[0, 5], [200, 5]]);
    const profile = t.profileForLine(LINE, SD)!;
    expect(profile).toBeDefined();
    const d = profile.depositAt(0.9);
    expect(Number.isFinite(d)).toBe(true);
    // 200px in ~1ms is far past fastSpeed → driest (≈ minDeposit).
    expect(d).toBeCloseTo(SD.minDeposit, 1);
  });

  it("captures slow→fast→slow as wet→dry→wet deposit across a single line", () => {
    const t = new SelectionVelocityTracker();
    swipe(t, [
      [0, 0], // seed
      [10, 100], [20, 200], [30, 300], [40, 400], [50, 500], // left: ~0.1 px/ms (slow)
      [100, 510], [150, 520], [200, 530], [250, 540], // middle: ~5 px/ms (fast)
      [260, 640], [280, 840], [300, 1040], // right: ~0.1 px/ms (slow)
    ]);
    const p = t.profileForLine(LINE, SD)!;
    const left = p.depositAt(0.1); // x≈30 (slow → wet)
    const mid = p.depositAt(0.5); // x≈150 (fast → dry)
    const right = p.depositAt(0.93); // x≈280 (slow → wet)
    expect(mid).toBeLessThan(left);
    expect(mid).toBeLessThan(right);
    expect(left).toBeGreaterThan(0.9); // wet ends stay near full deposit
    expect(mid).toBeLessThan(0.7); // fast middle clearly drier
  });

  it("returns undefined for a line with no samples (→ legacy geometry)", () => {
    const t = new SelectionVelocityTracker();
    swipe(t, [[0, 0], [50, 100]]);
    // A line band far from the sampled y has no samples.
    expect(t.profileForLine({ top: 500, height: 16, left: 0, width: 300 }, SD)).toBeUndefined();
  });

  it("reset() clears the field", () => {
    const t = new SelectionVelocityTracker();
    swipe(t, [[0, 0], [50, 100]]);
    expect(t.hasData()).toBe(true);
    t.reset();
    expect(t.hasData()).toBe(false);
    expect(t.profileForLine(LINE, SD)).toBeUndefined();
  });

  it("a new gesture (reset on pointerdown) discards the previous swipe's speeds", () => {
    const t = new SelectionVelocityTracker();
    const n = node();
    // A fast swipe first.
    for (const [o, time] of [[0, 0], [100, 510], [200, 520]] as [number, number][]) {
      t.recordSample(selection(n, 0, o), 0, 0, time, SD.smoothing);
    }
    expect(t.profileForLine(LINE, SD)!.depositAt(0.5)).toBeLessThan(0.8); // dry from the fast pass
    // A new gesture begins: highlightSelection resets the tracker on pointerdown.
    t.reset();
    // A slow new swipe elsewhere must not inherit the old fast deposit.
    t.recordSample(selection(n, 5000, 5000), 0, 0, 1000, SD.smoothing);
    t.recordSample(selection(n, 5000, 5010), 0, 0, 1200, SD.smoothing); // slow
    const p = t.profileForLine({ top: 50, height: 16, left: 5000, width: 20 }, SD);
    expect(p).toBeDefined();
    expect(p!.depositAt(0.5)).toBeGreaterThan(0.9); // wet again, history cleared
  });
});
