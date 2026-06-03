// Four hand-drawn variations of the slider "Filled" scribble — the dense sawtooth that the
// ScribbleFill reveals left-to-right as the slider moves (see ScribbleFill.tsx). Each is a
// list of zigzag vertices fed straight to Perfect Freehand (no resampling, so the teeth stay
// sharp). Generated with a seeded PRNG so server and client agree and a given slider keeps a
// stable scribble across renders — the only randomness at runtime is which of the four a
// slider draws (nextScribble), exactly like the marker SQUIGGLES.

type Scribble = { pts: [number, number][] };

// Nominal authoring box, matching the supplied Filled.svg (472×10, teeth between y≈0.85 and
// y≈8.85). ScribbleFill stretches the stroke's real bounds to the track, so these are only
// relative proportions — what matters is the tooth rhythm, not the absolute size.
const WIDTH = 472;
const TOP = 0.85;
const BOTTOM = 8.85;

// mulberry32 — a tiny deterministic PRNG so each variation is reproducible from its seed.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One zigzag: walk left→right laying alternating bottom/top teeth, with hand-drawn jitter on
// the tooth spacing and peak heights (plus the occasional taller tooth) so no two teeth — or
// variations — are identical.
function makeScribble(seed: number): Scribble {
  const r = rng(seed);
  const jit = (amp: number) => (r() * 2 - 1) * amp;
  // ~2.5u between teeth — a dense sawtooth that reads as a textured band at the 8px track size,
  // matching the supplied Filled.svg.
  const meanStep = 2.5 + jit(0.15);
  const pts: [number, number][] = [];
  let x = 0.8 + r() * 0.6;
  let i = 0;
  while (x < WIDTH - 1.5) {
    const baseY = i % 2 === 0 ? BOTTOM : TOP;
    const tall = r() < 0.07 ? jit(0.8) : 0; // sporadic over/undershoot, like a hurried pen
    pts.push([x, baseY + jit(0.15) + tall]);
    x += meanStep + jit(0.7);
    i++;
  }
  return { pts };
}

export const SCRIBBLES: Scribble[] = [
  makeScribble(0x5c1b3a),
  makeScribble(0xa713e2),
  makeScribble(0x2f9d51),
  makeScribble(0xe48207),
];

// Draw scribbles from a shuffled bag so all four are used before any repeats; refill when
// empty, never starting a fresh bag on the index that ended the last one (mirrors squiggles).
let bag: number[] = [];
let last = -1;

export function nextScribble(): number {
  if (bag.length === 0) {
    bag = SCRIBBLES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag.length > 1 && bag[bag.length - 1] === last) {
      [bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]];
    }
  }
  last = bag.pop()!;
  return last;
}
