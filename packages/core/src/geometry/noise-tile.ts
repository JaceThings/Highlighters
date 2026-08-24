import { clamp } from "../internal/math.js";
import type { NoiseTile } from "../types.js";
import { hashU32 } from "./rng.js";

const DEFAULT_TILE_WIDTH = 256;
const DEFAULT_TILE_HEIGHT = 64;

const STRIATION_FREQUENCY = "0.04 0.34";
const PATCH_FREQUENCY = "0.012";

const STRIATION_ALPHA_MIN = 0.82;
const STRIATION_ALPHA_SLOPE = 0.16;
const PATCH_ALPHA_MIN = 0.86;
const PATCH_ALPHA_SLOPE = 0.14;

const STRIATION_OCTAVES = 1;
const PATCH_OCTAVES = 2;

export interface NoiseTileOptions {
  width?: number;
  height?: number;
  seed: number;
  streakiness: number;
  feathering: number;
  dryout?: number;
}

function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function quantizeKnob(value: number): number {
  return Math.round(clamp(value, 0, 1) * 50) / 50;
}

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64Ascii(input: string): string {
  if ("btoa" in globalThis) return btoa(input);
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

function buildNoiseTileSvg(opts: Required<NoiseTileOptions>): string {
  const { width, height, seed, streakiness, feathering, dryout } = opts;

  const striationSeed = hashU32(seed * 2 + 3) % 256;
  const patchSeed = hashU32(seed * 2 + 7) % 256;

  const striationSlope = STRIATION_ALPHA_SLOPE * (0.5 + 6 * streakiness);
  const striationMin = STRIATION_ALPHA_MIN - 0.6 * streakiness;

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

function dryoutTransfer(dryout: number): string {
  if (dryout <= 0) return "1";
  const segments = 16;
  const cut = Math.round(dryout * 0.45 * segments);
  const values: string[] = [];
  for (let i = 0; i < segments; i++) values.push(i < cut ? "0" : "1");
  return values.join(" ");
}

const tileCache = new Map<string, string>();

export function buildNoiseTileDataUrl(opts: NoiseTileOptions): string {
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
    tileCache.delete(key);
    tileCache.set(key, hit);
    return hit;
  }
  const url = `data:image/svg+xml;base64,${toBase64Ascii(buildNoiseTileSvg(resolved))}`;
  if (tileCache.size > 512) {
    const half = Math.floor(tileCache.size / 2);
    const iter = tileCache.keys();
    for (let i = 0; i < half; i++) tileCache.delete(iter.next().value!);
  }
  tileCache.set(key, url);
  return url;
}

export function buildNoiseTile(opts: NoiseTileOptions): NoiseTile {
  const width = opts.width ?? DEFAULT_TILE_WIDTH;
  const height = opts.height ?? DEFAULT_TILE_HEIGHT;
  return {
    dataUrl: buildNoiseTileDataUrl({ ...opts, width, height }),
    width,
    height,
  };
}
