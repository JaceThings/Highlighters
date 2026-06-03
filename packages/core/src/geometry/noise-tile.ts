import { clamp } from "../internal/math.js";
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
 *  - **Striations** — `baseFrequency "0.04 0.34"`: a long horizontal stride with
 *    a moderate vertical change produces chunky horizontal pen-stroke lanes
 *    parallel to the swipe direction (the primary realism tell, R17). The lower
 *    vertical frequency makes each lane tall enough to read as a band rather
 *    than hair-thin noise.
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
 * Striation layer base frequency: low x (long horizontal stride) + moderate y
 * yields chunky horizontal lanes parallel to the stroke. The deliberately low
 * vertical frequency makes each lane tall enough to read as a band rather than
 * fine, hair-thin noise.
 */
const STRIATION_FREQUENCY = "0.04 0.34";
/** Pressure-patch layer base frequency: large soft coverage blobs. */
const PATCH_FREQUENCY = "0.012";

/**
 * Mask-alpha floors and slopes. These are the *base* (zero-knob) values; the
 * builder lowers the floor and widens the slope as `streakiness` / `dryout` rise
 * so the texture goes from a near-flat wash to obviously streaky, broken-up ink.
 * At the zero-knob baseline the combined alpha stays high enough that the rounded
 * marker-tip caps don't sit on a low-alpha hole.
 */
const STRIATION_ALPHA_MIN = 0.82;
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
   * `0`–`1`; raises the streak layer's alpha *contrast* (the lengthwise
   * lighter/darker lanes, R17) — at `1` the lanes are obviously streaky, at `0`
   * the layer is a near-flat wash. Clamped internally.
   */
  streakiness: number;
  /**
   * Pressure-patch density driving the second `feTurbulence` layer. Normalized
   * `0`–`1`; raises the soft pressure-blob contribution (capillary feathering,
   * R17). Clamped internally.
   */
  feathering: number;
  /**
   * Probabilistic alpha gaps (skipping). Normalized `0`–`1`; raises the patch
   * layer's contrast and lowers its floor, then a discrete alpha threshold cuts
   * the low-coverage regions to transparent — so higher `dryout` punches more
   * visible transparent holes/skips through the ink. Clamped internally.
   * Optional; defaults to `0` (no skipping). */
  dryout?: number;
}

/**
 * Round to 3 decimals so the emitted SVG string is stable (two equal inputs →
 * byte-identical output).
 */
function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
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
 * - **streakiness** widens the striation layer's alpha slope *and* drops its
 *   floor, so the lengthwise lanes go from a flat wash (knob `0`) to strong,
 *   obviously streaky light/dark lanes (knob `1`).
 * - **feathering** widens the soft pressure-patch layer's slope (blotchier).
 * - **dryout** steepens the patch layer and lowers its floor, then a discrete
 *   `feComponentTransfer` alpha threshold cuts the lowest-coverage regions to
 *   fully transparent — punching visible skip-holes through the ink.
 *
 * Both `feColorMatrix` rows map turbulence luminance into the mask's alpha
 * channel; `feComposite` with arithmetic `k1=1` multiplies the two layers so the
 * darkest patch and darkest streak reinforce.
 */
function buildNoiseTileSvg(opts: Required<NoiseTileOptions>): string {
  const { width, height, seed } = opts;
  const streakiness = clamp(opts.streakiness, 0, 1);
  const feathering = clamp(opts.feathering, 0, 1);
  const dryout = clamp(opts.dryout, 0, 1);

  // Decorrelate the two layers' seeds from one master seed. The integer hash
  // avalanches the bits so adjacent master seeds don't yield adjacent layer
  // seeds, and `% 256` keeps them in feTurbulence's documented seed range.
  const striationSeed = hashU32(seed * 2 + 3) % 256;
  const patchSeed = hashU32(seed * 2 + 7) % 256;

  // Streakiness drives strong contrast: a steeply widening slope (6× span) and a
  // floor that falls well away as the knob climbs, so at mid-to-high values the
  // lengthwise lanes clearly alternate light/dark along the stroke. At knob 0 the
  // slope is narrow and the floor stays high, keeping a near-flat smooth wash.
  // The floor bottoms out at ~0.22 at streakiness 1 (0.82 - 0.6), so the dark
  // lanes go deep without ever punching a transparent hole under the tip caps.
  const striationSlope = STRIATION_ALPHA_SLOPE * (0.5 + 6 * streakiness);
  const striationMin = STRIATION_ALPHA_MIN - 0.6 * streakiness;

  // Dryout steepens the patch layer and lowers its floor so more area falls
  // below the cut threshold; feathering blots it. Floor floors out near 0.2 at
  // full dryout so the gaps are deep, not merely dim.
  const patchSlope = PATCH_ALPHA_SLOPE * (0.5 + feathering) + 0.6 * dryout;
  const patchMin = PATCH_ALPHA_MIN - 0.62 * dryout;

  // Discrete alpha threshold: at dryout 0 it passes everything through (single
  // 1-entry table = identity); as dryout rises the first table entries become 0,
  // hard-cutting the low-coverage regions to transparent skip-holes.
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
 * Build the `tableValues` for the dryout alpha threshold (`feFuncA` discrete).
 *
 * At `dryout = 0` the table is `"1"` — a single entry, the identity pass-through
 * (no skipping). As dryout rises, leading entries flip to `0`, so any sampled
 * alpha below the cut maps to fully transparent — a hard skip-hole — while the
 * upper band stays opaque. The cut fraction scales with dryout (up to ~45% of the
 * range at the maximum), giving an obviously more broken-up stroke as the knob
 * climbs.
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
 * Build a `data:` URL for the dual-`feTurbulence` noise tile (A14 §1).
 *
 * Deterministic from `seed` (and the two density knobs); never percentage-sized.
 * Pure string-building — no DOM, no `btoa`, safe from the SSR `/path` entry.
 *
 * @returns A `data:image/svg+xml;base64,…` URL (the bare URL, no CSS `url(...)`
 *   wrapper — callers compose that), suitable for `mask-image`.
 */
// Memoised: a mark's update() rebuilds this every call, but the tile is identical unless one of
// its inputs changes — and most option drags (opacity, angle, …) never touch them. Caching the
// base64 encode turns repeated updates into a map lookup.
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
