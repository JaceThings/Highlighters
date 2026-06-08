// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { colorMinChannel, effectiveBlend } from "../src/render/blend.js";

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

describe("effectiveBlend", () => {
  const doc = document;

  it("switches a near-white multiply ink to normal so it stays visible", () => {
    expect(effectiveBlend("multiply", "#ffffff", doc)).toBe("normal");
    expect(effectiveBlend("multiply", "#fafafa", doc)).toBe("normal");
    expect(effectiveBlend("multiply", "rgb(255, 250, 245)", doc)).toBe("normal");
  });

  it("keeps multiply for saturated and mid inks", () => {
    expect(effectiveBlend("multiply", "#fff14d", doc)).toBe("multiply"); // yellow
    expect(effectiveBlend("multiply", "#ff6fae", doc)).toBe("multiply"); // pink
    expect(effectiveBlend("multiply", "#cccccc", doc)).toBe("multiply"); // mid grey, below threshold
  });

  it("respects an explicit non-multiply blend regardless of colour", () => {
    expect(effectiveBlend("screen", "#ffffff", doc)).toBe("screen");
    expect(effectiveBlend("normal", "#fff14d", doc)).toBe("normal");
    expect(effectiveBlend("darken", "#ffffff", doc)).toBe("darken");
  });

  it("keeps multiply when the colour can't be parsed (safe default)", () => {
    // happy-dom has no canvas colour parsing, so named colours fall through to multiply here.
    expect(effectiveBlend("multiply", "rebeccapurple", doc)).toBe("multiply");
  });
});
