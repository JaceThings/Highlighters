import type { NoiseTile } from "../types.js";
import { hashU32 } from "./rng.js";

/**
 * The fixed-pixel noise tile that gives the mark its organic, hand-inked grain.
 *
 * This is the literal answer to "SVGs that don't stretch" (anchored-grid doc §1):
 * the grain is two `feTurbulence` layers baked **once** into a constant-pixel,
 * seamlessly-stitched tile and then *repeated* — never scaled. Per-line variety
 * comes from offsetting the sample window (see `mark-space.ts`'s `maskOffset`),
 * so grain density is invariant to mark width/height (blueprint R22c / A14 §1).
 *
 * The two layers are:
 *
 *  - **Striations** — `baseFrequency "0.04 0.7"`: a long horizontal stride with
 *    rapid vertical change produces fine horizontal pen-stroke streaks parallel
 *    to the swipe direction (the primary realism tell, R17).
 *  - **Pressure patches** — `baseFrequency "0.012"`: large soft blobs of
 *    coverage variation, as if the nib pressed harder in places.
 *
 * Both use `stitchTiles="stitch"` so the tile wraps with no visible seam, and the
 * whole thing is emitted as a `data:` URL of pure string-built SVG — there is no
 * DOM access, so it is safe from the SSR `/path` entry.
 */

/** Default tile dimensions: a cached 256×64 raster. */
const DEFAULT_TILE_WIDTH = 256;
const DEFAULT_TILE_HEIGHT = 64;

/**
 * Striation layer base frequency: low x (long horizontal stride) + high y (rapid
 * vertical change) yields horizontal streaks parallel to the stroke.
 */
const STRIATION_FREQUENCY = "0.04 0.7";
/** Pressure-patch layer base frequency: large soft coverage blobs. */
const PATCH_FREQUENCY = "0.012";

/**
 * Mask-alpha floors are kept high so the rounded marker-tip caps never sit on a
 * low-alpha patch that would eat into them. The combined alpha bottoms out
 * around `striationMin × patchMin ≈ 0.72` — visible texture with no perceived
 * "cutoff" at the cap edges.
 */
const STRIATION_ALPHA_MIN = 0.84;
const STRIATION_ALPHA_SLOPE = 0.16;
const PATCH_ALPHA_MIN = 0.86;
const PATCH_ALPHA_SLOPE = 0.14;

/** Octave counts per layer. */
const STRIATION_OCTAVES = 1;
const PATCH_OCTAVES = 2;

/** Options describing a noise tile. */
export interface NoiseTileOptions {
  /** Fixed tile width in px (default {@link DEFAULT_TILE_WIDTH}). */
  width?: number;
  /** Fixed tile height in px (default {@link DEFAULT_TILE_HEIGHT}). */
  height?: number;
  /** Master seed; mixed into both layers' `feTurbulence` seeds deterministically. */
  seed: number;
  /**
   * Striation density driving the horizontal `feTurbulence` layer. Normalized
   * `0`–`1`; raises the streak layer's alpha contribution (the lengthwise
   * lighter/darker lanes, R17). Clamped internally.
   */
  streakiness: number;
  /**
   * Pressure-patch density driving the second `feTurbulence` layer. Normalized
   * `0`–`1`; raises the soft pressure-blob contribution (capillary feathering,
   * R17). Clamped internally.
   */
  feathering: number;
}

/** Clamp a value into `[lo, hi]`. */
function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * Round to 3 decimals and drop a trailing `.000`-style fraction, so the emitted
 * SVG string is stable and compact (two equal inputs → byte-identical output).
 */
function fmt(value: number): string {
  const r = Math.round(value * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
}

/**
 * A standard base64 alphabet encoder over a UTF-16 string of single-byte chars.
 *
 * The SVG payload is pure ASCII, so each `charCodeAt` is one byte; this avoids
 * depending on `btoa` (a DOM/browser global absent in some SSR runtimes) while
 * producing the identical, deterministic encoding everywhere.
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
 * Build the SVG source string for the dual-`feTurbulence` tile.
 *
 * The streak layer's alpha slope grows with `streakiness` (more pronounced
 * lengthwise lanes), the patch layer's alpha slope grows with `feathering`
 * (softer, blotchier pressure variation); both `feColorMatrix` rows map the
 * turbulence luminance into the mask's alpha channel, and `feComposite` with an
 * arithmetic `k1=1` multiplies the two layers so the darkest patch and darkest
 * streak reinforce.
 */
function buildNoiseTileSvg(opts: Required<NoiseTileOptions>): string {
  const { width, height, seed } = opts;
  const streakiness = clamp(opts.streakiness, 0, 1);
  const feathering = clamp(opts.feathering, 0, 1);

  // Decorrelate the two layers' seeds from one master seed. The integer hash
  // avalanches the bits so adjacent master seeds don't yield adjacent layer
  // seeds, and `% 256` keeps them in feTurbulence's documented seed range.
  const striationSeed = hashU32(seed * 2 + 3) % 256;
  const patchSeed = hashU32(seed * 2 + 7) % 256;

  // Alpha floors stay fixed (so caps never thin out); the *slope* (contrast)
  // tracks the streakiness / feathering knobs.
  const striationSlope = STRIATION_ALPHA_SLOPE * (0.5 + streakiness);
  const patchSlope = PATCH_ALPHA_SLOPE * (0.5 + feathering);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<defs>` +
    `<filter id="g" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${STRIATION_FREQUENCY}" numOctaves="${STRIATION_OCTAVES}" stitchTiles="stitch" seed="${striationSeed}" result="s"/>` +
    `<feColorMatrix in="s" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${fmt(striationSlope)} ${fmt(STRIATION_ALPHA_MIN)}" result="sa"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="${PATCH_FREQUENCY}" numOctaves="${PATCH_OCTAVES}" stitchTiles="stitch" seed="${patchSeed}" result="p"/>` +
    `<feColorMatrix in="p" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${fmt(patchSlope)} ${fmt(PATCH_ALPHA_MIN)}" result="pa"/>` +
    `<feComposite in="sa" in2="pa" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/>` +
    `</filter>` +
    `</defs>` +
    `<rect width="${width}" height="${height}" fill="black" filter="url(#g)"/>` +
    `</svg>`
  );
}

/**
 * Build a `data:` URL for the dual-`feTurbulence` noise tile (A14 §1).
 *
 * Deterministic from `seed` (and the two density knobs); never percentage-sized.
 * Pure string-building — no DOM, no `btoa`, safe from the SSR `/path` entry.
 *
 * @returns A `data:image/svg+xml;base64,…` URL (the bare URL, no CSS `url(...)`
 *   wrapper — callers compose that), suitable for `mask-image`.
 */
export function buildNoiseTileDataUrl(opts: NoiseTileOptions): string {
  const resolved: Required<NoiseTileOptions> = {
    width: opts.width ?? DEFAULT_TILE_WIDTH,
    height: opts.height ?? DEFAULT_TILE_HEIGHT,
    seed: opts.seed,
    streakiness: opts.streakiness,
    feathering: opts.feathering,
  };
  const svg = buildNoiseTileSvg(resolved);
  return `data:image/svg+xml;base64,${toBase64Ascii(svg)}`;
}

/**
 * Wrap {@link buildNoiseTileDataUrl} plus the fixed dimensions into a
 * {@link NoiseTile}. Pure; the dimensions are what the renderer applies as the
 * fixed px `mask-size` (repeated, never scaled).
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
