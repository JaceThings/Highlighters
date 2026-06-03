/**
 * Deterministic randomness primitives for the anchored-grid method.
 *
 * Every per-mark value is derived from an integer seed through one of these. None
 * touch the platform PRNG or wall-clock time, so identical seeds always produce
 * byte-identical geometry across server and client. The canonical primitive is
 * {@link hashJitter}; the helpers add an integer hash for derived seed mixing.
 */

/**
 * The canonical jitter primitive: a value in `[-1, 1]` from the `sin()`-based hash
 * `frac(sin(seed * 9301 + 49297) * 233280) * 2 - 1`. Pure, stateless, and stable
 * across server and client. Adjacent integer seeds map to widely scattered
 * outputs, so the convention is to draw decorrelated values by offsetting the seed
 * before hashing.
 *
 * @param seed - An integer seed. Non-integers are accepted but callers should pass
 *   integers so a given grid index / line always resolves identically.
 */
export function hashJitter(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * A mulberry-style integer hash returning an unsigned 32-bit integer. Unlike
 * {@link hashJitter} this avalanches the input bits hard, so it is the right tool
 * for deriving one stable seed from another without the low-bit correlation a
 * plain `seed + k` offset can show.
 */
export function hashU32(seed: number): number {
  let z = (seed | 0) + 0x6d2b79f5;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return (z ^ (z >>> 14)) >>> 0;
}

/**
 * A deterministic `() => number` PRNG in `[0, 1)` seeded by `seed` (mulberry32).
 * For the rare cases that need many decorrelated draws in sequence rather than a
 * handful of offset lookups via {@link hashJitter}. Never reads global state, the
 * platform PRNG, or time.
 */
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
