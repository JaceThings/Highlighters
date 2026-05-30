// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toRanges } from "../src/targeting/normalize.js";
import { findTextRanges } from "../src/targeting/text-search.js";
import {
  collectPageRanges,
  isExcluded,
} from "../src/targeting/include-exclude.js";
import {
  computeAnchor,
  mergeRectsByLine,
  rangesToLineRects,
} from "../src/targeting/line-rects.js";
import {
  createMutationWatcher,
  createReflowObserver,
} from "../src/targeting/observers.js";

/** Replace document.body's markup and return the body for convenience. */
function setBody(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

/** Concatenate the text content of a range's resolved span. */
function rangeText(range: Range): string {
  return range.toString();
}

/** Build a plain DOMRect-shaped object for the pure rect-merge tests. */
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    left,
    top,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return { x: left, y: top, width, height };
    },
  } as DOMRect;
}

/** Wrap an array of rects as a `DOMRectList`, for mocking `getClientRects()`. */
function domRectList(rects: DOMRect[]): DOMRectList {
  const list = {
    length: rects.length,
    item: (i: number) => rects[i] ?? null,
    [Symbol.iterator]: () => rects[Symbol.iterator](),
  } as unknown as DOMRectList & Record<number, DOMRect>;
  for (let i = 0; i < rects.length; i++) list[i] = rects[i];
  return list;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// V1 — normalization per input type (R6a–R6f)
// ---------------------------------------------------------------------------

describe("toRanges — V1 normalization per input type", () => {
  it("normalizes an Element to a range over its content (R6a)", () => {
    const body = setBody(`<p id="t">hello world</p>`);
    const el = body.querySelector("#t")!;
    const ranges = toRanges(el);
    expect(ranges).toHaveLength(1);
    expect(rangeText(ranges[0])).toBe("hello world");
  });

  it("normalizes a CSS selector to one range per matched element (R6a)", () => {
    setBody(`<p class="x">one</p><p class="x">two</p><p>skip</p>`);
    const ranges = toRanges(".x");
    expect(ranges).toHaveLength(2);
    expect(ranges.map(rangeText)).toEqual(["one", "two"]);
  });

  it("returns the given Range directly (R6b)", () => {
    const body = setBody(`<p>abcdef</p>`);
    const text = body.querySelector("p")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 4);
    const ranges = toRanges(range);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toBe(range);
    expect(rangeText(ranges[0])).toBe("bcd");
  });

  it("drops a collapsed Range", () => {
    const body = setBody(`<p>abc</p>`);
    const text = body.querySelector("p")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 1);
    expect(toRanges(range)).toEqual([]);
  });

  it("normalizes a Selection to its non-collapsed ranges (R6b)", () => {
    const body = setBody(`<p>selected text</p>`);
    const text = body.querySelector("p")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 8);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const ranges = toRanges(selection);
    expect(ranges).toHaveLength(1);
    expect(rangeText(ranges[0])).toBe("selected");
  });

  it("normalizes a TextTarget to a range per match (R6c)", () => {
    setBody(`<p>cat dog cat</p>`);
    const ranges = toRanges({ text: "cat" });
    expect(ranges).toHaveLength(2);
    expect(ranges.every((r) => rangeText(r) === "cat")).toBe(true);
  });

  it("normalizes a TextTarget with a RegExp under a custom root (R6c)", () => {
    const body = setBody(`<div id="root">a1 b2</div><div>c3</div>`);
    const root = body.querySelector("#root")!;
    const ranges = toRanges({ text: /\w\d/g, root });
    expect(ranges.map(rangeText)).toEqual(["a1", "b2"]);
  });

  it("normalizes a PageTarget to ranges over its text (R6d)", () => {
    const body = setBody(`<article id="a"><p>one</p><p>two</p></article>`);
    const root = body.querySelector("#a")!;
    const ranges = toRanges({ root });
    expect(ranges.map(rangeText)).toEqual(["one", "two"]);
  });

  it("returns [] for an unmatched selector without throwing", () => {
    setBody(`<p>x</p>`);
    expect(toRanges(".nope")).toEqual([]);
  });

  it("returns [] for an invalid selector without throwing", () => {
    setBody(`<p>x</p>`);
    expect(() => toRanges(":::invalid")).not.toThrow();
    expect(toRanges(":::invalid")).toEqual([]);
  });

  it("returns [] for an empty string target", () => {
    expect(toRanges("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Nested include/exclude precedence (R7)
// ---------------------------------------------------------------------------

describe("include/exclude — structural exclusion precedence (R7)", () => {
  it("excludes a subtree nested inside an included ancestor", () => {
    const body = setBody(`
      <article id="a">
        <p>keep this</p>
        <pre><code>skip code</code></pre>
        <p>keep that</p>
      </article>
    `);
    const root = body.querySelector("#a")!;
    const ranges = collectPageRanges({ root, exclude: ["code"] });
    const text = ranges.map(rangeText).join(" | ");
    expect(text).toContain("keep this");
    expect(text).toContain("keep that");
    expect(text).not.toContain("skip code");
  });

  it("honors data-highlight-exclude on a subtree", () => {
    const body = setBody(`
      <div id="a">
        <span>visible</span>
        <span data-highlight-exclude><b>hidden</b> text</span>
      </div>
    `);
    const root = body.querySelector("#a")!;
    const ranges = collectPageRanges({ root });
    const text = ranges.map(rangeText).join(" ");
    expect(text).toContain("visible");
    expect(text).not.toContain("hidden");
    expect(text).not.toContain("text");
  });

  it("exclusion wins even when the node also matches an include selector", () => {
    const body = setBody(`
      <div id="a">
        <section class="inc"><p>included</p></section>
        <section class="inc exc"><p class="inc">conflicted</p></section>
      </div>
    `);
    const root = body.querySelector("#a")!;
    const ranges = collectPageRanges({
      root,
      include: [".inc"],
      exclude: [".exc"],
    });
    const text = ranges.map(rangeText).join(" ");
    expect(text).toContain("included");
    expect(text).not.toContain("conflicted");
  });

  it("with include selectors, only included subtrees are collected", () => {
    const body = setBody(`
      <div id="a">
        <p class="want">yes</p>
        <p>no</p>
      </div>
    `);
    const root = body.querySelector("#a")!;
    const ranges = collectPageRanges({ root, include: [".want"] });
    expect(ranges.map(rangeText)).toEqual(["yes"]);
  });

  it("isExcluded matches the node's own element and ancestors", () => {
    const body = setBody(`
      <div class="drop"><p><span id="leaf">x</span></p></div>
      <div><p><span id="ok">y</span></p></div>
    `);
    const leaf = body.querySelector("#leaf")!;
    const ok = body.querySelector("#ok")!;
    expect(isExcluded(leaf, [".drop"])).toBe(true);
    expect(isExcluded(ok, [".drop"])).toBe(false);
    expect(isExcluded(leaf.firstChild!, [".drop"])).toBe(true);
  });

  it("collectPageRanges defaults the root to document.body", () => {
    setBody(`<p>body text</p>`);
    const ranges = collectPageRanges({});
    expect(ranges.map(rangeText)).toEqual(["body text"]);
  });

  it("collectPageRanges skips text in non-rendered subtrees (<script>/<style>)", () => {
    const root = setBody(`<style>.x{color:red}</style><p>visible</p><script>var x=1</script>`);
    const ranges = collectPageRanges({ root });
    expect(ranges.map(rangeText)).toEqual(["visible"]);
  });
});

// ---------------------------------------------------------------------------
// Text search across element boundaries (R6c)
// ---------------------------------------------------------------------------

describe("findTextRanges — matches across inline boundaries (R6c)", () => {
  it("finds a string match spanning two inline elements", () => {
    const body = setBody(`<p>foo<em>bar</em>baz</p>`);
    const ranges = findTextRanges(body, "obarb");
    expect(ranges).toHaveLength(1);
    expect(rangeText(ranges[0])).toBe("obarb");
    // The match must start in the first text node and end in the third.
    expect(ranges[0].startContainer).not.toBe(ranges[0].endContainer);
  });

  it("finds every non-overlapping occurrence of a string", () => {
    const body = setBody(`<p>ababab</p>`);
    const ranges = findTextRanges(body, "ab");
    expect(ranges).toHaveLength(3);
    expect(ranges.every((r) => rangeText(r) === "ab")).toBe(true);
  });

  it("matches a RegExp across an inline boundary", () => {
    const body = setBody(`<p>price is <b>42</b> dollars</p>`);
    const ranges = findTextRanges(body, /is\s+42/);
    expect(ranges).toHaveLength(1);
    expect(rangeText(ranges[0])).toBe("is 42");
  });

  it("treats a non-global RegExp as global without mutating the caller's pattern", () => {
    const body = setBody(`<p>x x x</p>`);
    const pattern = /x/;
    const ranges = findTextRanges(body, pattern);
    expect(ranges).toHaveLength(3);
    // The caller's RegExp is untouched (no lingering lastIndex).
    expect(pattern.lastIndex).toBe(0);
    expect(pattern.global).toBe(false);
  });

  it("honors the case-insensitive flag", () => {
    const body = setBody(`<p>Hello HELLO hello</p>`);
    const ranges = findTextRanges(body, /hello/gi);
    expect(ranges).toHaveLength(3);
  });

  it("is case-sensitive for string queries", () => {
    const body = setBody(`<p>Cat cat CAT</p>`);
    const ranges = findTextRanges(body, "cat");
    expect(ranges).toHaveLength(1);
    expect(rangeText(ranges[0])).toBe("cat");
  });

  it("does not loop forever on a zero-width RegExp", () => {
    const body = setBody(`<p>abc</p>`);
    const ranges = findTextRanges(body, /(?:)/g);
    expect(ranges).toEqual([]);
  });

  it("returns [] for an empty string query and for no match", () => {
    const body = setBody(`<p>abc</p>`);
    expect(findTextRanges(body, "")).toEqual([]);
    expect(findTextRanges(body, "zzz")).toEqual([]);
  });

  it("matches every occurrence even for a sticky (`y`) RegExp", () => {
    // Sticky anchors `exec` to lastIndex; adding `g` doesn't override it, so a
    // naive scan would stop at the first gap and under-match. The flag is stripped.
    expect(findTextRanges(setBody(`<p>x_x_x</p>`), /x/y)).toHaveLength(3);
    expect(findTextRanges(setBody(`<p>aXbXc</p>`), /X/y)).toHaveLength(2);
    // A plain global pattern is unaffected.
    expect(findTextRanges(setBody(`<p>x_x_x</p>`), /x/g)).toHaveLength(3);
  });

  it("never matches text inside non-rendered subtrees (<script>/<style>)", () => {
    const body = setBody(`<style>.foo{}</style><p>foo</p><script>var foo=1</script>`);
    const ranges = findTextRanges(body, "foo");
    expect(ranges).toHaveLength(1);
    expect(rangeText(ranges[0])).toBe("foo"); // only the visible <p>
  });
});

// ---------------------------------------------------------------------------
// line-rects — pure rect merging and seeding
// ---------------------------------------------------------------------------

describe("mergeRectsByLine / computeAnchor / rangesToLineRects", () => {
  it("merges rects sharing a vertical centre into one line", () => {
    // Two fragments on the same line (e.g. text split by an <em>).
    const merged = mergeRectsByLine([
      rect(10, 100, 40, 20),
      rect(55, 100, 30, 20),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].left).toBe(10);
    expect(merged[0].right).toBe(85);
  });

  it("keeps rects on different lines separate, sorted top-to-bottom", () => {
    const merged = mergeRectsByLine([
      rect(10, 140, 40, 20),
      rect(10, 100, 40, 20),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].top).toBe(100);
    expect(merged[1].top).toBe(140);
  });

  it("drops bbox artifacts taller than ~3x the median line height", () => {
    const merged = mergeRectsByLine([
      rect(10, 100, 40, 20),
      rect(10, 130, 40, 20),
      rect(10, 100, 40, 200), // paragraph-spanning artifact
    ]);
    // The 200px-tall artifact is dropped; two normal lines remain.
    expect(merged).toHaveLength(2);
    expect(merged.every((r) => r.height <= 20)).toBe(true);
  });

  it("does not merge same-line rects across a wide horizontal gap", () => {
    // Same vertical centre but far apart (flex justify-between columns).
    const merged = mergeRectsByLine([
      rect(10, 100, 40, 20),
      rect(400, 100, 40, 20),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("returns [] for empty input", () => {
    expect(mergeRectsByLine([])).toEqual([]);
  });

  it("computeAnchor derives top/left from the ranges' client rects", () => {
    const body = setBody(`<p>anchored</p>`);
    const range = document.createRange();
    range.selectNodeContents(body.querySelector("p")!);
    const fakeRects = [rect(30, 50, 100, 20)];
    vi.spyOn(range, "getClientRects").mockReturnValue(domRectList(fakeRects));
    const anchor = computeAnchor([range]);
    expect(anchor.top).toBe(50);
    expect(anchor.left).toBe(30);
  });

  it("computeAnchor returns {0,0} with nothing to measure", () => {
    expect(computeAnchor([])).toEqual({ top: 0, left: 0 });
  });

  it("rangesToLineRects emits stable seeds and isFirst/isLast flags", () => {
    const body = setBody(`<p>two lines</p>`);
    const range = document.createRange();
    range.selectNodeContents(body.querySelector("p")!);
    const fakeRects = [rect(20, 100, 80, 20), rect(20, 130, 60, 20)];
    vi.spyOn(range, "getClientRects").mockReturnValue(domRectList(fakeRects));

    const anchor = { top: 100, left: 20 };
    const lines = rangesToLineRects([range], anchor);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ seed: 0, isFirst: true, isLast: false });
    // seed = round((130 - 100) * 7) = 210
    expect(lines[1]).toMatchObject({ seed: 210, isFirst: false, isLast: true });
  });

  it("rangesToLineRects returns [] for empty ranges", () => {
    expect(rangesToLineRects([], { top: 0, left: 0 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Observers — dispose() removes all listeners (R8, R22, R33)
// ---------------------------------------------------------------------------

describe("createReflowObserver — dispose removes all listeners", () => {
  let observed: Set<Element>;
  let roDisconnect: ReturnType<typeof vi.fn>;
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRaf: number;
  let cancelled: Set<number>;
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;
  let fontsResolve: () => void;
  let disposers: Array<() => void>;

  /** Create a reflow observer and track its disposer for teardown. */
  function makeReflow(targets: Element[], cb: () => void): () => void {
    const dispose = createReflowObserver(targets, cb);
    disposers.push(dispose);
    return dispose;
  }

  beforeEach(() => {
    observed = new Set();
    roDisconnect = vi.fn(() => observed.clear());
    rafCallbacks = new Map();
    cancelled = new Set();
    nextRaf = 1;
    disposers = [];

    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = (el: Element) => observed.add(el);
        unobserve = (el: Element) => observed.delete(el);
        disconnect = roDisconnect;
      },
    );
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextRaf++;
      rafCallbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelled.add(id);
      rafCallbacks.delete(id);
    });

    const ready = new Promise<void>((resolve) => {
      fontsResolve = resolve;
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready },
    });

    addSpy = vi.spyOn(window, "addEventListener");
    removeSpy = vi.spyOn(window, "removeEventListener");
  });

  function flushRaf() {
    const cbs = [...rafCallbacks.values()];
    rafCallbacks.clear();
    for (const cb of cbs) cb(0);
  }

  afterEach(() => {
    // Dispose any still-live observers so their window listeners don't bleed
    // into the next test (a stray listener would schedule an extra rAF).
    for (const dispose of disposers) dispose();
  });

  it("observes each target and adds a window resize listener", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    makeReflow([el], vi.fn());
    expect(observed.has(el)).toBe(true);
    expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("rAF-batches multiple sources into a single callback per frame", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const cb = vi.fn();
    makeReflow([el], cb);
    // Two resize events before a frame fires.
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    expect(rafCallbacks.size).toBe(1);
    flushRaf();
    expect(cb).toHaveBeenCalledOnce();
  });

  it("dispose disconnects the observer, removes the listener, cancels rAF", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const cb = vi.fn();
    const dispose = makeReflow([el], cb);

    window.dispatchEvent(new Event("resize")); // schedule a pending rAF
    const pendingId = [...rafCallbacks.keys()][0];

    dispose();
    expect(roDisconnect).toHaveBeenCalledOnce();
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(cancelled.has(pendingId)).toBe(true);

    // A queued frame must not fire the callback after disposal.
    cb.mockClear();
    flushRaf();
    expect(cb).not.toHaveBeenCalled();
  });

  it("fires once when fonts become ready, but not after dispose", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const cb = vi.fn();
    const dispose = makeReflow([el], cb);

    dispose();
    fontsResolve();
    await Promise.resolve();
    await Promise.resolve();
    flushRaf();
    expect(cb).not.toHaveBeenCalled();
  });

  it("dispose is idempotent", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const dispose = makeReflow([el], vi.fn());
    dispose();
    expect(() => dispose()).not.toThrow();
    expect(roDisconnect).toHaveBeenCalledOnce();
  });
});

describe("createMutationWatcher — debounced and leak-free (R8)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces a burst of mutations into one callback", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const cb = vi.fn();
    createMutationWatcher(root, cb);

    root.appendChild(document.createElement("span"));
    root.appendChild(document.createElement("span"));
    // MutationObserver delivers microtask-async; let it enqueue.
    await Promise.resolve();
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it("dispose disconnects the observer and cancels a pending flush", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const cb = vi.fn();
    const dispose = createMutationWatcher(root, cb);

    root.appendChild(document.createElement("span"));
    await Promise.resolve();
    dispose();
    vi.advanceTimersByTime(100);
    expect(cb).not.toHaveBeenCalled();

    // No further callbacks after disposal even on new mutations.
    root.appendChild(document.createElement("span"));
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    expect(cb).not.toHaveBeenCalled();
  });

  it("dispose is idempotent", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dispose = createMutationWatcher(root, vi.fn());
    dispose();
    expect(() => dispose()).not.toThrow();
  });
});
