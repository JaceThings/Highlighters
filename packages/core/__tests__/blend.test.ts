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

  it("keeps a saturated or mid ink on multiply, unchanged", () => {
    expect(effectiveInk("multiply", "#fff14d", backdrop("#fff"), doc)).toEqual({
      blend: "multiply",
      color: "#fff14d",
    });
    expect(effectiveInk("multiply", "#cccccc", backdrop("#000"), doc)).toEqual({
      blend: "multiply",
      color: "#cccccc",
    });
  });

  it("paints a near-white ink as a normal wash on a dark backdrop", () => {
    expect(effectiveInk("multiply", "#ffffff", backdrop("#0a0a0a"), doc)).toEqual({
      blend: "normal",
      color: "#ffffff",
    });
  });

  it("darkens a near-white ink to an off-white multiply wash on a light backdrop", () => {
    const r = effectiveInk("multiply", "#ffffff", backdrop("#fbfbf9"), doc);
    expect(r.blend).toBe("multiply");
    expect(r.color).not.toBe("#ffffff");
    expect(colorMinChannel(r.color)).toBeLessThan(255); // an actual off-white, not pure white
  });

  it("assumes a light page when no opaque backdrop is found", () => {
    const r = effectiveInk("multiply", "#ffffff", backdrop("transparent"), doc);
    expect(r.blend).toBe("multiply");
    expect(r.color).not.toBe("#ffffff");
  });

  it("respects an explicit non-multiply blend regardless of colour or backdrop", () => {
    expect(effectiveInk("screen", "#ffffff", backdrop("#000"), doc)).toEqual({
      blend: "screen",
      color: "#ffffff",
    });
    expect(effectiveInk("normal", "#fff14d", backdrop("#fff"), doc)).toEqual({
      blend: "normal",
      color: "#fff14d",
    });
  });
});
