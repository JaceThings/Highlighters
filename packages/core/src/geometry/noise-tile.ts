import { clamp } from "../internal/math.js";
import type { NoiseTile } from "../types.js";
import { hashU32 } from "./rng.js";

/**
 * The fixed-pixel noise tile that gives the mark its organic, hand-inked grain.
 *
 * The grain is two `feTurbulence` layers baked once into a constant-pixel,
 * seamlessly-stitched tile and then repeated — never scaled. Per-line variety
 * comes from offsetting the sample window (see `mark-space.ts`'s `maskOffset`),
 * so grain density is invariant to mark width/height. The layers are striations
 * (chunky horizontal pen-stroke lanes parallel to the swipe) and pressure patches
 * (large soft coverage blobs). Both use `stitchTiles="stitch"` so the tile wraps
 * seamlessly, and the whole thing is a `data:` URL of pure string-built SVG —
 * no DOM access, safe from the SSR `/path` entry.
 */

const DEFAULT_TILE_WIDTH = 256;
const DEFAULT_TILE_HEIGHT = 64;

/**
 * Striation base frequency: low x (long horizontal stride) + moderate y yields
 * chunky horizontal lanes. The low vertical frequency makes each lane tall enough
 * to read as a band rather than hair-thin noise.
 */
const STRIATION_FREQUENCY = "0.04 0.34";
const PATCH_FREQUENCY = "0.012";

/**
 * Base (zero-knob) mask-alpha floors and slopes; the builder lowers the floor and
 * widens the slope as `streakiness`/`dryout` rise. At the baseline the combined
 * alpha stays high enough that the rounded tip caps don't sit on a low-alpha hole.
 */
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
  /**
   * Striation density, `0`–`1`. Raises the streak layer's alpha contrast (the
   * lengthwise lighter/darker lanes) — `1` is obviously streaky, `0` a near-flat
   * wash. Clamped internally.
   */
  streakiness: number;
  /**
   * Pressure-patch density, `0`–`1`. Raises the soft pressure-blob contribution
   * (capillary feathering). Clamped internally.
   */
  feathering: number;
  /**
   * Probabilistic alpha gaps (skipping), `0`–`1`. Raises the patch layer's
   * contrast and lowers its floor, then a discrete alpha threshold cuts
   * low-coverage regions to transparent — higher `dryout` punches more holes.
   * Clamped internally. Defaults to `0` (no skipping).
   */
  dryout?: number;
}

/** Round to 3 decimals so the emitted SVG string is byte-stable. */
function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Base64 encoder over a string of single-byte chars. The SVG payload is pure
 * ASCII, so each `charCodeAt` is one byte; this avoids `btoa` (a DOM global absent
 * in some SSR runtimes) while encoding identically everywhere.
 */
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

/**
 * Build the SVG source for the dual-`feTurbulence` tile. The two `feColorMatrix`
 * rows map turbulence luminance into the mask's alpha channel; `feComposite` with
 * arithmetic `k1=1` multiplies the two layers so the darkest patch and darkest
 * streak reinforce.
 */
function buildNoiseTileSvg(opts: Required<NoiseTileOptions>): string {
  const { width, height, seed } = opts;
  const streakiness = clamp(opts.streakiness, 0, 1);
  const feathering = clamp(opts.feathering, 0, 1);
  const dryout = clamp(opts.dryout, 0, 1);

  // Decorrelate the two layers' seeds. The integer hash avalanches the bits so
  // adjacent master seeds don't yield adjacent layer seeds, and `% 256` keeps them
  // in feTurbulence's documented seed range.
  const striationSeed = hashU32(seed * 2 + 3) % 256;
  const patchSeed = hashU32(seed * 2 + 7) % 256;

  // The floor bottoms out at ~0.22 at streakiness 1, so the dark lanes go deep
  // without ever punching a transparent hole under the tip caps.
  const striationSlope = STRIATION_ALPHA_SLOPE * (0.5 + 6 * streakiness);
  const striationMin = STRIATION_ALPHA_MIN - 0.6 * streakiness;

  // Dryout steepens the patch layer and lowers its floor so more area falls below
  // the cut threshold; feathering blots it.
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

/**
 * Build the `tableValues` for the dryout alpha threshold (`feFuncA` discrete). At
 * `dryout = 0` the table is `"1"` (identity, no skipping). As dryout rises, leading
 * entries flip to `0`, so any sampled alpha below the cut maps to fully transparent.
 * The cut fraction scales with dryout up to ~45% of the range.
 */
function dryoutTransfer(dryout: number): string {
  if (dryout <= 0) return "1";
  const segments = 16;
  const cut = Math.round(dryout * 0.45 * segments);
  const values: string[] = [];
  for (let i = 0; i < segments; i++) values.push(i < cut ? "0" : "1");
  return values.join(" ");
}

/**
 * Build a `data:image/svg+xml;base64,…` URL for the noise tile (bare URL, no CSS
 * `url(...)` wrapper). Deterministic from `seed` and the density knobs; pure
 * string-building, safe from the SSR `/path` entry.
 */
// Memoised: a mark's update() rebuilds this every call, but the tile is identical
// unless an input changes — and most option drags never touch them.
const tileCache = new Map<string, string>();

export function buildNoiseTileDataUrl(opts: NoiseTileOptions): string {
  const resolved: Required<NoiseTileOptions> = {
    width: opts.width ?? DEFAULT_TILE_WIDTH,
    height: opts.height ?? DEFAULT_TILE_HEIGHT,
    seed: opts.seed,
    streakiness: opts.streakiness,
    feathering: opts.feathering,
    dryout: opts.dryout ?? 0,
  };
  const key = `${resolved.width}x${resolved.height}|${resolved.seed}|${resolved.streakiness}|${resolved.feathering}|${resolved.dryout}`;
  const hit = tileCache.get(key);
  if (hit !== undefined) return hit;
  const url = `data:image/svg+xml;base64,${toBase64Ascii(buildNoiseTileSvg(resolved))}`;
  if (tileCache.size > 512) tileCache.clear();
  tileCache.set(key, url);
  return url;
}

/**
 * Wrap {@link buildNoiseTileDataUrl} plus the fixed dimensions into a
 * {@link NoiseTile}. The dimensions are the fixed px `mask-size` the renderer
 * applies (repeated, never scaled).
 */
export function buildNoiseTile(opts: NoiseTileOptions): NoiseTile {
  const width = opts.width ?? DEFAULT_TILE_WIDTH;
  const height = opts.height ?? DEFAULT_TILE_HEIGHT;
  return {
    dataUrl: buildNoiseTileDataUrl({ ...opts, width, height }),
    width,
    height,
  };
}
