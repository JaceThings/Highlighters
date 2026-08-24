import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SelectionVelocityTracker } from "../src/targeting/velocity.js";
import type { ResolvedSpeedDynamics } from "../src/types.js";

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
  const text = document.createTextNode("x".repeat(10000));
  document.body.appendChild(text);
  return text;
}
function selection(n: Text, anchorOffset: number, focusOffset: number): Selection {
  const current = document.getSelection()!;
  current.setBaseAndExtent(n, anchorOffset, n, focusOffset);
  return current;
}

let original: typeof document.createRange;
beforeEach(() => {
  original = document.createRange;
  document.createRange = (): Range => {
    const range = original.call(document);
    let startOffset = 0;
    const setStart = range.setStart.bind(range);
    range.setStart = (n: Node, o: number): void => {
      startOffset = o;
      setStart(n, o);
    };
    range.getBoundingClientRect = (): DOMRect =>
      new DOMRect(startOffset, LINE.top, 0, LINE.height);
    return range;
  };
});
afterEach(() => {
  document.createRange = original;
});

function swipe(tracker: SelectionVelocityTracker, steps: [number, number][]): void {
  const n = node();
  for (const [offset, t] of steps) {
    tracker.recordSample(selection(n, 0, offset), 0, 0, t, SD.smoothing);
  }
}

describe("SelectionVelocityTracker", () => {
  it("floors dt so an instant jump yields a finite (dry) deposit, not Infinity", () => {
    const t = new SelectionVelocityTracker();
    swipe(t, [[0, 5], [200, 5]]);
    const profile = t.profileForLine(LINE, SD)!;
    expect(profile).toBeDefined();
    const d = profile.depositAt(0.9);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(SD.minDeposit, 1);
  });

  it("captures slow→fast→slow as wet→dry→wet deposit across a single line", () => {
    const t = new SelectionVelocityTracker();
    swipe(t, [
      [0, 0],
      [10, 100], [20, 200], [30, 300], [40, 400], [50, 500],
      [100, 510], [150, 520], [200, 530], [250, 540],
      [260, 640], [280, 840], [300, 1040],
    ]);
    const p = t.profileForLine(LINE, SD)!;
    const left = p.depositAt(0.1);
    const mid = p.depositAt(0.5);
    const right = p.depositAt(0.93);
    expect(mid).toBeLessThan(left);
    expect(mid).toBeLessThan(right);
    expect(left).toBeGreaterThan(0.9);
    expect(mid).toBeLessThan(0.7);
  });

  it("returns undefined for a line with no samples (→ legacy geometry)", () => {
    const t = new SelectionVelocityTracker();
    swipe(t, [[0, 0], [50, 100]]);
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
    const steps: [number, number][] = [
      [0, 0],
      [100, 510],
      [200, 520],
    ];
    for (const [o, time] of steps) {
      t.recordSample(selection(n, 0, o), 0, 0, time, SD.smoothing);
    }
    expect(t.profileForLine(LINE, SD)!.depositAt(0.5)).toBeLessThan(0.8);
    t.reset();
    t.recordSample(selection(n, 5000, 5000), 0, 0, 1000, SD.smoothing);
    t.recordSample(selection(n, 5000, 5010), 0, 0, 1200, SD.smoothing);
    const p = t.profileForLine({ top: 50, height: 16, left: 5000, width: 20 }, SD);
    expect(p).toBeDefined();
    expect(p!.depositAt(0.5)).toBeGreaterThan(0.9);
  });
});
