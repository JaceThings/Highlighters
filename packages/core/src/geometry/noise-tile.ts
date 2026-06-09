import { clamp } from "../internal/math.js";
import type { NoiseTile } from "../types.js";
import { hashU32 } from "./rng.js";

/**
 * The fixed-pixel noise tile that gives the mark its hand-inked grain.
 *
 * Two `feTurbulence` layers (striation lanes + pressure patches) baked once into a
 * constant-pixel, seamlessly-stitched tile and repeated, never scaled, so grain density
 * is invariant to mark size. Pure string-built SVG `data:` URL: no DOM access (SSR-safe).
 */

const DEFAULT_TILE_WIDTH = 256;
const DEFAULT_TILE_HEIGHT = 64;

// Low x + moderate y yields chunky horizontal lanes that read as bands rather than hair-thin noise.
const STRIATION_FREQUENCY = "0.04 0.34";
const PATCH_FREQUENCY = "0.012";

// Base mask-alpha floors/slopes; the builder lowers the floor as the knobs rise. Baseline stays high enough that the tip caps don't sit on a low-alpha hole.
const STRIATION_ALPHA_MIN = 0.82;
const STRIATION_ALPHA_SLOPE = 0.16;
const PATCH_ALPHA_MIN = 0.86;
const PATCH_ALPHA_SLOPE = 0.14;

const STRIATION_OCTAVES = 1;
const PATCH_OCTAVES = 2;

export interface NoiseTileOptions {
  /** Fixed tile width in px (default {@link DEFAULT_TILE_WIDTH}). */
  width?: number;
  /** Fixed tile height in px (default {@link DEFAULT_TILE_HEIGHT}). */
  height?: number;
  /** Master seed; mixed into both layers' `feTurbulence` seeds deterministically. */
  seed: number;
  /** Striation density, `0`-`1`. Raises the streak layer's alpha contrast. Clamped internally. */
  streakiness: number;
  /** Pressure-patch density, `0`-`1`. Raises the soft pressure-blob contribution. Clamped internally. */
  feathering: number;
  /** Probabilistic alpha gaps, `0`-`1`: a discrete threshold cuts low-coverage regions to transparent. Defaults to `0`. */
  dryout?: number;
}

/** Round to 3 decimals so the emitted SVG string is byte-stable. */
function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** Clamp then snap a density knob to its 0.02 bucket (sub-bucket alpha deltas are below perceptual threshold), so a knob drag hits the cache instead of rebuilding per frame. */
function quantizeKnob(value: number): number {
  return Math.round(clamp(value, 0, 1) * 50) / 50;
}

// ASCII-only base64; avoids `btoa` (a DOM global absent in some SSR runtimes) while encoding identically everywhere.
const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64Ascii(input: string): string {
  let out = "";
  const len = input.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = input.charCodeAt(i) & 0xff;
    const b1 = i + 1 < len ? input.charCodeAt(i + 1) & 0xff : 0;
    const b2 = i + 2 < len ? input.charCodeAt(i + 2) & 0xff : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64_ALPHABET[(triple >> 18) & 0x3f];
    out += B64_ALPHABET[(triple >> 12) & 0x3f];
    out += i + 1 < len ? B64_ALPHABET[(triple >> 6) & 0x3f] : "=";
    out += i + 2 < len ? B64_ALPHABET[triple & 0x3f] : "=";
  }
  return out;
}

/** Build the SVG source for the dual-`feTurbulence` tile; arithmetic `feComposite` multiplies the two layers so dark streak and dark patch reinforce. */
function buildNoiseTileSvg(opts: Required<NoiseTileOptions>): string {
  const { width, height, seed } = opts;
  const streakiness = clamp(opts.streakiness, 0, 1);
  const feathering = clamp(opts.feathering, 0, 1);
  const dryout = clamp(opts.dryout, 0, 1);

  // Decorrelate the two layers' seeds; `% 256` keeps them in feTurbulence's documented range.
  const striationSeed = hashU32(seed * 2 + 3) % 256;
  const patchSeed = hashU32(seed * 2 + 7) % 256;

  // Floor bottoms out at ~0.22 at streakiness 1 so dark lanes go deep without punching a hole under the tip caps.
  const striationSlope = STRIATION_ALPHA_SLOPE * (0.5 + 6 * streakiness);
  const striationMin = STRIATION_ALPHA_MIN - 0.6 * streakiness;

  // Dryout steepens the patch layer and lowers its floor so more area falls below the cut threshold.
  const patchSlope = PATCH_ALPHA_SLOPE * (0.5 + feathering) + 0.6 * dryout;
  const patchMin = PATCH_ALPHA_MIN - 0.62 * dryout;

  const dryoutCut = dryoutTransfer(dryout);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<defs>` +
    `<filter id="g" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${STRIATION_FREQUENCY}" numOctaves="${STRIATION_OCTAVES}" stitchTiles="stitch" seed="${striationSeed}" result="s"/>` +
    `<feColorMatrix in="s" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${fmt(striationSlope)} ${fmt(striationMin)}" result="sa"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="${PATCH_FREQUENCY}" numOctaves="${PATCH_OCTAVES}" stitchTiles="stitch" seed="${patchSeed}" result="p"/>` +
    `<feColorMatrix in="p" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${fmt(patchSlope)} ${fmt(patchMin)}" result="pa"/>` +
    `<feComposite in="sa" in2="pa" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="ink"/>` +
    `<feComponentTransfer in="ink">` +
    `<feFuncA type="discrete" tableValues="${dryoutCut}"/>` +
    `</feComponentTransfer>` +
    `</filter>` +
    `</defs>` +
    `<rect width="${width}" height="${height}" fill="black" filter="url(#g)"/>` +
    `</svg>`
  );
}

/** Build the `tableValues` for the dryout alpha threshold: `"1"` at `dryout = 0`, leading entries flipping to `0` (transparent) up to ~45% of the range. */
function dryoutTransfer(dryout: number): string {
  if (dryout <= 0) return "1";
  const segments = 16;
  const cut = Math.round(dryout * 0.45 * segments);
  const values: string[] = [];
  for (let i = 0; i < segments; i++) values.push(i < cut ? "0" : "1");
  return values.join(" ");
}

/** Build a bare `data:image/svg+xml;base64,…` URL for the noise tile. Deterministic from `seed` and the density knobs (quantized to 0.02 buckets). Memoised, so a knob drag rebuilds at most one tile per bucket. */
const tileCache = new Map<string, string>();

export function buildNoiseTileDataUrl(opts: NoiseTileOptions): string {
  // Knobs quantize before both the key and the SVG, so cache identity and emitted tile always agree. seed/width/height stay raw.
  const resolved: Required<NoiseTileOptions> = {
    width: opts.width ?? DEFAULT_TILE_WIDTH,
    height: opts.height ?? DEFAULT_TILE_HEIGHT,
    seed: opts.seed,
    streakiness: quantizeKnob(opts.streakiness),
    feathering: quantizeKnob(opts.feathering),
    dryout: quantizeKnob(opts.dryout ?? 0),
  };
  const key = `${resolved.width}x${resolved.height}|${resolved.seed}|${resolved.streakiness}|${resolved.feathering}|${resolved.dryout}`;
  const hit = tileCache.get(key);
  if (hit !== undefined) {
    // Re-promote so the oldest-half eviction approximates LRU; a drag can't evict its own hot tiles.
    tileCache.delete(key);
    tileCache.set(key, hit);
    return hit;
  }
  const url = `data:image/svg+xml;base64,${toBase64Ascii(buildNoiseTileSvg(resolved))}`;
  // Evict the oldest half rather than clearing all, so a continuous drag keeps its hot working set.
  if (tileCache.size > 512) {
    const half = Math.floor(tileCache.size / 2);
    const iter = tileCache.keys();
    for (let i = 0; i < half; i++) tileCache.delete(iter.next().value!);
  }
  tileCache.set(key, url);
  return url;
}

/** Wrap {@link buildNoiseTileDataUrl} plus the fixed px dimensions (the renderer's `mask-size`, repeated never scaled) into a {@link NoiseTile}. */
export function buildNoiseTile(opts: NoiseTileOptions): NoiseTile {
  const width = opts.width ?? DEFAULT_TILE_WIDTH;
  const height = opts.height ?? DEFAULT_TILE_HEIGHT;
  return {
    dataUrl: buildNoiseTileDataUrl({ ...opts, width, height }),
    width,
    height,
  };
}
