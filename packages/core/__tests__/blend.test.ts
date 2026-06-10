// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { colorMinChannel, effectiveInk } from "../src/render/blend.js";

/** A detached element whose computed background-color resolves to `bg` (happy-dom reads inline style). */
function backdrop(bg: string): HTMLElement {
  const el = document.createElement("div");
  el.style.backgroundColor = bg;
  document.body.appendChild(el);
  return el;
}

describe("colorMinChannel", () => {
  it("reads the smallest channel of 6-digit hex", () => {
    expect(colorMinChannel("#ffffff")).toBe(255);
    expect(colorMinChannel("#000000")).toBe(0);
    expect(colorMinChannel("#80a0c0")).toBe(0x80);
  });

  it("yellow's min channel is its zero blue, not its high luminance", () => {
    expect(colorMinChannel("#ffff00")).toBe(0);
    expect(colorMinChannel("#fff14d")).toBe(0x4d); // fluorescent yellow swatch
  });

  it("expands 3- and 4-digit hex", () => {
    expect(colorMinChannel("#fff")).toBe(255);
    expect(colorMinChannel("#f00")).toBe(0);
    expect(colorMinChannel("#ffff")).toBe(255); // #rgba
  });

  it("parses rgb() / rgba()", () => {
    expect(colorMinChannel("rgb(255, 255, 255)")).toBe(255);
    expect(colorMinChannel("rgba(250, 240, 255, 0.5)")).toBe(240);
    expect(colorMinChannel("rgb(10 20 30)")).toBe(10);
  });

  it("returns null for notations it can't parse without a browser", () => {
    expect(colorMinChannel("white")).toBeNull();
    expect(colorMinChannel("hsl(0 0% 100%)")).toBeNull();
    expect(colorMinChannel("not-a-color")).toBeNull();
  });
});

describe("effectiveInk", () => {
  const doc = document;

  it("keeps a saturated or mid ink in the shared container, unchanged", () => {
    expect(effectiveInk("multiply", "#fff14d", backdrop("#fff"), doc)).toEqual({
      layer: null,
      color: "#fff14d",
    });
    expect(effectiveInk("multiply", "#cccccc", backdrop("#000"), doc)).toEqual({
      layer: null,
      color: "#cccccc",
    });
  });

  it("gives a near-white ink its own normal layer on a dark backdrop", () => {
    expect(effectiveInk("multiply", "#ffffff", backdrop("#0a0a0a"), doc)).toEqual({
      layer: "normal",
      color: "#ffffff",
    });
  });

  it("darkens a near-white ink to an off-white in the shared container on a light backdrop", () => {
    const r = effectiveInk("multiply", "#ffffff", backdrop("#fbfbf9"), doc);
    expect(r.layer).toBeNull(); // stays in the shared multiply container, no private layer
    expect(r.color).not.toBe("#ffffff");
    expect(colorMinChannel(r.color)).toBeLessThan(255); // an actual off-white, not pure white
  });

  it("assumes a light page when no opaque backdrop is found", () => {
    const r = effectiveInk("multiply", "#ffffff", backdrop("transparent"), doc);
    expect(r.layer).toBeNull();
    expect(r.color).not.toBe("#ffffff");
  });

  it("leaves an explicit non-multiply blend to the shared container untouched", () => {
    expect(effectiveInk("screen", "#ffffff", backdrop("#000"), doc)).toEqual({
      layer: null,
      color: "#ffffff",
    });
    expect(effectiveInk("normal", "#fff14d", backdrop("#fff"), doc)).toEqual({
      layer: null,
      color: "#fff14d",
    });
  });

  describe("vivid", () => {
    it("true lifts any ink onto a normal escape layer, even a saturated ink on a light backdrop", () => {
      expect(effectiveInk("multiply", "#fff14d", backdrop("#fff"), doc, true)).toEqual({
        layer: "normal",
        color: "#fff14d",
      });
    });

    it('"screen" composites the band with screen, on any backdrop', () => {
      expect(effectiveInk("multiply", "#fff14d", backdrop("#0a0a0a"), doc, "screen")).toEqual({
        layer: "screen",
        color: "#fff14d",
      });
      expect(effectiveInk("multiply", "#fff14d", backdrop("#fff"), doc, "screen")).toEqual({
        layer: "screen",
        color: "#fff14d",
      });
    });

    it("wins over an explicit blendMode", () => {
      expect(effectiveInk("screen", "#fff14d", backdrop("#0a0a0a"), doc, true).layer).toBe("normal");
      expect(effectiveInk("darken", "#fff14d", backdrop("#0a0a0a"), doc, "screen").layer).toBe("screen");
    });

    it("never substitutes the colour, and is deterministic (no backdrop probe)", () => {
      // backdrop null: the near-white path would probe, but vivid short-circuits before it.
      expect(effectiveInk("multiply", "#ffffff", null, doc, true)).toEqual({ layer: "normal", color: "#ffffff" });
      expect(effectiveInk("multiply", "#ffffff", null, doc, "screen")).toEqual({ layer: "screen", color: "#ffffff" });
    });

    it("is a no-op when false (identical to the default path)", () => {
      expect(effectiveInk("multiply", "#fff14d", backdrop("#fff"), doc, false)).toEqual(
        effectiveInk("multiply", "#fff14d", backdrop("#fff"), doc),
      );
    });
  });
});
