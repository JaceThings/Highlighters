import { describe, expect, it } from "vitest";

import { DEFAULT_OPTIONS } from "../src/config/defaults.js";
import { mergeOptions, resolveOptions } from "../src/config/merge.js";
import {
  defaultSwatch,
  getPalette,
  PALETTES,
  resolveSwatch,
} from "../src/config/palettes.js";

describe("palettes", () => {
  it("ships the five curated families with yellow-first fluorescent", () => {
    expect(Object.keys(PALETTES).sort()).toEqual(
      ["calm", "fluorescent", "mild", "neutral", "vintage"].sort(),
    );
    // Fluorescent yellow is the canonical default - least text-obscuring (R15).
    expect(Object.keys(PALETTES.fluorescent.swatches)[0]).toBe("yellow");
  });

  it("resolves swatches and throws on unknown family / swatch", () => {
    expect(resolveSwatch({ palette: "fluorescent", swatch: "yellow" })).toBe(
      PALETTES.fluorescent.swatches.yellow,
    );
    // @ts-expect-error - deliberately invalid family name.
    expect(() => getPalette("rainbow")).toThrow(/unknown palette/);
    expect(() =>
      resolveSwatch({ palette: "fluorescent", swatch: "chartreuse" }),
    ).toThrow(/unknown swatch/);
  });

  it("defaultSwatch picks the least-obscuring hue per family", () => {
    expect(defaultSwatch("fluorescent")).toBe(
      PALETTES.fluorescent.swatches.yellow,
    );
    expect(defaultSwatch("mild")).toBe(PALETTES.mild.swatches.yellow);
  });
});

describe("DEFAULT_OPTIONS", () => {
  it("encodes the documented defaults and is frozen", () => {
    expect(DEFAULT_OPTIONS.markType).toBe("highlight");
    expect(DEFAULT_OPTIONS.blendMode).toBe("multiply");
    expect(DEFAULT_OPTIONS.color).toBe(defaultSwatch("mild"));
    expect(DEFAULT_OPTIONS.snap).toBe("word");
    expect(DEFAULT_OPTIONS.renderer).toBe("auto");
    expect(DEFAULT_OPTIONS.glow.enabled).toBe(false);
    expect(DEFAULT_OPTIONS.seed).toBeNull();
    expect(DEFAULT_OPTIONS.edge.cap).toBe("round");
    expect(Object.isFrozen(DEFAULT_OPTIONS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_OPTIONS.ink)).toBe(true);
  });
});

describe("mergeOptions", () => {
  it("override wins per top-level field", () => {
    const merged = mergeOptions({ opacity: 0.5 }, { opacity: 0.9 });
    expect(merged.opacity).toBe(0.9);
  });

  it("merges namespaced groups field-wise rather than replacing them", () => {
    const merged = mergeOptions(
      { ink: { flow: 0.5, feathering: 0.8 } },
      { ink: { feathering: 0.2 } },
    );
    // flow survives from base; feathering overridden.
    expect(merged.ink).toEqual({ flow: 0.5, feathering: 0.2 });
  });

  it("reconciles the shape/markType synonyms onto markType", () => {
    const fromShape = mergeOptions({}, { shape: "underline" });
    expect(fromShape.markType).toBe("underline");
    expect(fromShape.shape).toBeUndefined();

    // markType wins over shape when both are present in the override.
    const both = mergeOptions({}, { shape: "underline", markType: "strike-through" });
    expect(both.markType).toBe("strike-through");

    // override.shape beats base.markType.
    const overrideShape = mergeOptions({ markType: "highlight" }, { shape: "underline" });
    expect(overrideShape.markType).toBe("underline");
  });

  it("is pure (does not mutate either argument)", () => {
    const base = { ink: { flow: 0.5 } };
    const override = { ink: { feathering: 0.2 } };
    mergeOptions(base, override);
    expect(base).toEqual({ ink: { flow: 0.5 } });
    expect(override).toEqual({ ink: { feathering: 0.2 } });
  });
});

describe("resolveOptions", () => {
  it("produces a fully-resolved object with no undefined fields", () => {
    const r = resolveOptions();
    for (const value of Object.values(r)) {
      expect(value).not.toBeUndefined();
    }
    expect(r.tip.type).toBeDefined();
    expect(r.ink.flow).toBeTypeOf("number");
    expect(r.animation.duration).toBeTypeOf("number");
  });

  it("resolves the documented default look when no options are given", () => {
    const r = resolveOptions();
    // Muted yellow, low opacity, multiply, word snap.
    expect(r.color).toBe(PALETTES.mild.swatches.yellow);
    expect(r.opacity).toBe(0.55);
    expect(r.blendMode).toBe("multiply");
    expect(r.snap).toBe("word");
  });

  it("applies the precedence defaults → user (user wins)", () => {
    // User opacity beats the default.
    expect(resolveOptions({ opacity: 0.33 }).opacity).toBe(0.33);
    // User ink wins; unset ink fields keep their defaults.
    const r = resolveOptions({ ink: { streakiness: 0.01 } });
    expect(r.ink.streakiness).toBe(0.01);
    expect(r.ink.flow).toBe(DEFAULT_OPTIONS.ink.flow);
  });

  it("resolves a palette swatch reference and a named palette default", () => {
    expect(
      resolveOptions({ color: { palette: "calm", swatch: "mint" } }).color,
    ).toBe(PALETTES.calm.swatches.mint);
    // palette-only (no explicit color) → that family's default swatch.
    expect(resolveOptions({ palette: "vintage" }).color).toBe(
      defaultSwatch("vintage"),
    );
  });

  it("setting waviness and roughness to 0 yields clean straight edges (V3/R13)", () => {
    const r = resolveOptions({ edge: { waviness: 0, roughness: 0 } });
    expect(r.edge.waviness).toBe(0);
    expect(r.edge.roughness).toBe(0);
  });

  // --- input hardening (correctness audit) ---

  it("a user palette wins over the default color object (palette-only)", () => {
    // The default ships a color object; a palette-only call must still draw the
    // requested palette's default, not the default yellow.
    expect(resolveOptions({ palette: "calm" }).color).toBe(defaultSwatch("calm"));
    // An explicit color still wins over a palette.
    expect(resolveOptions({ color: "#abcabc", palette: "calm" }).color).toBe("#abcabc");
  });

  it("treats an empty/whitespace color as unset", () => {
    expect(resolveOptions({ color: "" }).color).toBe(DEFAULT_OPTIONS.color);
    expect(resolveOptions({ color: "   " }).color).toBe(DEFAULT_OPTIONS.color);
    expect(resolveOptions({ color: "", palette: "calm" }).color).toBe(defaultSwatch("calm"));
  });

  it("substitutes the default for a non-finite or non-positive duration", () => {
    const dflt = DEFAULT_OPTIONS.animation.duration;
    expect(resolveOptions({ animation: { duration: Infinity } }).animation.duration).toBe(dflt);
    expect(resolveOptions({ animation: { duration: NaN } }).animation.duration).toBe(dflt);
    expect(resolveOptions({ animation: { duration: 0 } }).animation.duration).toBe(dflt);
    expect(resolveOptions({ animation: { duration: -5 } }).animation.duration).toBe(dflt);
    expect(resolveOptions({ animation: { duration: 250 } }).animation.duration).toBe(250);
  });

  it("substitutes the default for NaN/Infinity numeric knobs", () => {
    expect(resolveOptions({ opacity: NaN }).opacity).toBe(DEFAULT_OPTIONS.opacity);
    expect(resolveOptions({ ink: { flow: NaN } }).ink.flow).toBe(DEFAULT_OPTIONS.ink.flow);
    expect(resolveOptions({ edge: { radius: Infinity } }).edge.radius).toBe(DEFAULT_OPTIONS.edge.radius);
    // A valid value still passes through.
    expect(resolveOptions({ opacity: 0.42 }).opacity).toBe(0.42);
  });

  it("resolves the speed-dynamics group with defaults, clamps, and partial merge", () => {
    const d = DEFAULT_OPTIONS.speed;
    // Defaults flow through untouched.
    expect(resolveOptions().speed).toEqual(d);
    // resolution clamps into [4, 24] and rounds.
    expect(resolveOptions({ speed: { resolution: 999 } }).speed.resolution).toBe(24);
    expect(resolveOptions({ speed: { resolution: 1 } }).speed.resolution).toBe(4);
    expect(resolveOptions({ speed: { resolution: 9.6 } }).speed.resolution).toBe(10);
    // 0..1 weights clamp.
    expect(resolveOptions({ speed: { sensitivity: 5 } }).speed.sensitivity).toBe(1);
    expect(resolveOptions({ speed: { minDeposit: -3 } }).speed.minDeposit).toBe(0);
    // px/ms thresholds floor at 0 but otherwise pass through.
    expect(resolveOptions({ speed: { fastSpeed: 3.5 } }).speed.fastSpeed).toBe(3.5);
    expect(resolveOptions({ speed: { slowSpeed: -1 } }).speed.slowSpeed).toBe(0);
    // A partial override merges field-wise (other fields keep their defaults).
    const partial = resolveOptions({ speed: { enabled: false } }).speed;
    expect(partial.enabled).toBe(false);
    expect(partial.sensitivity).toBe(d.sensitivity);
    // NaN falls back to the default.
    expect(resolveOptions({ speed: { sensitivity: NaN } }).speed.sensitivity).toBe(d.sensitivity);
  });

  it("flat ink and edges resolve truly flat", () => {
    const r = resolveOptions({
      ink: { feathering: 0, streakiness: 0, dryout: 0, startEndBuildup: 0 },
      edge: { waviness: 0, roughness: 0 },
    });
    expect(r.ink.feathering).toBe(0);
    expect(r.ink.streakiness).toBe(0);
    expect(r.ink.dryout).toBe(0);
    expect(r.ink.startEndBuildup).toBe(0);
    expect(r.edge.waviness).toBe(0);
    expect(r.edge.roughness).toBe(0);
  });

  it("honors an explicit seed and the shape synonym", () => {
    expect(resolveOptions({ seed: 42 }).seed).toBe(42);
    expect(resolveOptions().seed).toBeNull();
    expect(resolveOptions({ shape: "strike-through" }).markType).toBe(
      "strike-through",
    );
  });

  it("a negative startEndBuildup engages the anti-pool guardrail", () => {
    expect(resolveOptions({ ink: { startEndBuildup: -0.3 } }).ink.startEndBuildup).toBeLessThan(0);
  });

  it("does not mutate DEFAULT_OPTIONS", () => {
    const before = JSON.stringify(DEFAULT_OPTIONS);
    resolveOptions({ opacity: 0.1, ink: { flow: 0.9 } });
    expect(JSON.stringify(DEFAULT_OPTIONS)).toBe(before);
  });
});
