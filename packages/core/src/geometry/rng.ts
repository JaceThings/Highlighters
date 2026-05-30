/**
 * Deterministic randomness primitives for the anchored-grid method.
 *
 * Every per-mark value in `@highlighters` is derived from an integer seed
 * through one of these functions. None of them touch the platform pseudo-random
 * generator or wall-clock time, so identical seeds always produce byte-identical
 * geometry across server and client (blueprint R35 / C4, A14 §5). The canonical
 * primitive is {@link hashJitter} — a `sin()`-based hash — and the helpers here
 * add decorrelated offsets and an integer hash for derived seed mixing.
 */

/**
 * The canonical deterministic jitter primitive: a value in `[-1, 1]` from the
 * `sin()`-based hash `frac(sin(seed * 9301 + 49297) * 233280) * 2 - 1`.
 *
 * This hash is documented in the anchored-grid doc §5, and is chosen because it
 * is pure, stateless, and stable across
 * server and client — there is no platform pseudo-random generator and no
 * wall-clock read anywhere in the chain. Adjacent integer seeds map to widely
 * scattered outputs, so the convention throughout the library is to draw
 * decorrelated values by offsetting the seed before hashing.
 *
 * @param seed - An integer seed. Non-integers are accepted but callers should
 *   pass integers so that a given grid index / line always resolves identically.
 * @returns A deterministic value in `[-1, 1]`.
 */
export function hashJitter(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * A mulberry-style integer hash returning an unsigned 32-bit integer.
 *
 * Unlike {@link hashJitter} (which is tuned for visual jitter), this avalanches
 * the input bits hard, so it is the right tool for deriving one stable seed from
 * another (e.g. mixing a per-mark base seed with a layer index) without the
 * low-bit correlation a plain `seed + k` offset can show. Pure and deterministic.
 *
 * @param seed - Any finite number; the integer part drives the hash.
 * @returns An unsigned 32-bit integer in `[0, 2^32)`.
 */
export function hashU32(seed: number): number {
  // mulberry32's mixing step, run once over the seed.
  let z = (seed | 0) + 0x6d2b79f5;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return (z ^ (z >>> 14)) >>> 0;
}

/**
 * A deterministic `() => number` PRNG in `[0, 1)` seeded by `seed` (mulberry32).
 *
 * For the rare cases that need many decorrelated draws in sequence (rather than a
 * handful of offset lookups via {@link hashJitter}), this returns a stateful but
 * fully deterministic generator: the same `seed` always yields the same stream.
 * It never reads global state, the platform pseudo-random generator, or time.
 *
 * @param seed - The stream seed.
 * @returns A function that returns the next value in `[0, 1)` on each call.
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

/**
 * Map a {@link hashJitter} draw from `[-1, 1]` into `[0, 1]`, the form needed
 * when interpolating a value between a `min` and a `max` (`min + unit * range`).
 *
 * @param seed - The seed to hash.
 * @returns A deterministic value in `[0, 1]`.
 */
export function jitterUnit(seed: number): number {
  return hashJitter(seed) * 0.5 + 0.5;
}
