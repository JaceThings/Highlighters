/** Deterministic randomness primitives: no platform PRNG or wall-clock, so identical seeds yield byte-identical geometry on server and client. */

/** Canonical jitter primitive: a value in `[-1, 1]` from a `sin()`-based hash. Draw decorrelated values by offsetting the seed. */
export function hashJitter(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Mulberry-style integer hash to u32. Avalanches the bits hard, for deriving one stable seed from another without low-bit correlation. */
export function hashU32(seed: number): number {
  let z = (seed | 0) + 0x6d2b79f5;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return (z ^ (z >>> 14)) >>> 0;
}

/** Deterministic mulberry32 PRNG in `[0, 1)`, for cases needing many sequential draws rather than offset {@link hashJitter} lookups. */
export function mulberry(seed: number): () => number {
  let a = seed | 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
