# The Anchored-Grid Method - why these SVGs don't stretch

> The geometry technique `@highlighters` is built on. It's the reason the marks look hand-made yet never stretch, smear, or "swim" when a highlight resizes, reflows, or grows. Read this to understand the invariants the renderer must always honor.

---

## The one idea

> **Nothing is parameterized against the element's current size. Everything is anchored to an absolute pixel coordinate space, with randomness seeded by position/index rather than by a normalized fraction of width.**

A naïve highlighter normalizes its geometry to `[0,1]` across the mark and scales to fit. That stretches: make the mark wider and the waviness wavelength grows, the grain smears, the rounded cap balloons. Worse, while a highlight *grows* (a dragged selection, a reflow), every vertex is recomputed against the new width, so the wobble under the part you already covered visibly shifts ("swims").

The anchored-grid method fixes both: geometry is laid out on a fixed pixel grid and textures are sampled (not scaled), so widening a mark **adds more of the same** - it doesn't **stretch what's there**.

---

## The six mechanisms

### 1. Texture: a fixed-px tile, stitched and repeated - never scaled
The organic grain is two `feTurbulence` layers (horizontal striations + soft pressure patches) baked **once** into a fixed-size tile and used as a CSS mask:

```
feTurbulence type="fractalNoise" … stitchTiles="stitch"   // seamless wrap
mask-size: 256px 64px;   mask-repeat: repeat;              // FIXED px, tiled
```

`stitchTiles="stitch"` makes the noise wrap seamlessly, so the tile can repeat with no visible seam. Because `mask-size` is in **pixels** (not `%` or `cover`), the grain has **constant density at any mark width** - it never stretches. Per-line variety comes from sliding the sample window, not resizing the texture:

```js
// one cached raster, infinite distinct samples - offset, don't scale
const maskX = -((seed * 37) % tileW + tileW) % tileW;
const maskY = -((seed * 13) % tileH + tileH) % tileH;
maskPosition = `${maskX}px ${maskY}px`;
```

**This is the literal answer to "SVGs that don't stretch":** render the noise into a fixed tile, repeat it, and offset the sample - never scale it to fit.

### 2. Wavy edges on a fixed grid, seeded by grid index
The hand-drawn wobble on the top/bottom edges is a series of vertices. The crucial detail is *where the vertices live and how they're seeded.*

**The naïve way** (stretchy / swimming):
```js
const segs = Math.max(1, Math.round(Math.abs(len) / segLen));
for (let k = 1; k < segs; k++) {
  const x = startX + (k / segs) * len;        // ← x is a FRACTION of width
  const y = baseY + hashJitter(edgeSeed + k * 17) * amp;  // ← seed keyed on k
}
```
When the mark gets wider, `segs` increments, so every `x` slides *and* every seed (keyed on `k`) shifts - the entire wave re-shuffles on each growth step.

**The anchored way** (stable):
```js
const lo = Math.min(startX, endX), hi = Math.max(startX, endX);
// half-px epsilon so the first/last grid point doesn't land on a corner arc and kink
const firstIdx = Math.ceil((lo + 0.5) / segLen);
const lastIdx  = Math.floor((hi - 0.5) / segLen);
for (let i = firstIdx; i <= lastIdx; i++) {
  const x = i * segLen;                         // ← x on a FIXED global grid
  const y = baseY + hashJitter(edgeSeed + i * 17) * amp;  // ← seed keyed on grid index i
}
```
Now wavelength is a constant `segLen` px and each grid position has a fixed phase. Growing the mark only **appends** vertices at fresh grid x's; everything already drawn is byte-identical. A real highlighter pass behaves the same way - ink stays where you put it.

### 3. Cap pooling in absolute px, clamped - a marker property, not a stroke property
A real marker pools a fixed blob of ink where the tip enters and leaves the page. The end darkening must therefore be a fixed **px** width, not a percentage of the stroke.

**The naïve way:** `linear-gradient(85deg, … 2.2%, 8%, 92%, 100%)` → pool scales with width; long marks get thick smeared ends, short ones are tight.

**The anchored way:**
```css
background: linear-gradient(85deg,
  …  2px,
  …  min(10px, 40%),
  …  max(calc(100% - 10px), 60%),
  …  calc(100% - 2px));
```
Constant px pool, with `min`/`max` so a very short mark can't have its two pools overrun each other (capped at ~half the overlay each).

### 4. Geometry in absolute `path()` coordinates
The chisel shape is a `clip-path: path(...)` built in **px-local coordinates** (rounded corners as quadratic `Q` arcs at each vertex, slant as a px x-shift), not a percentage `polygon()`. So the corner radius and chisel slant keep their true size at any width - they don't distort with the box.

### 5. Deterministic seeds anchored to a layout-stable identity
Every per-line random value derives from one seed, and that seed is the **layout-stable identity** of the line (for live selection, the anchor-relative top):
```js
const seed = Math.round((line.top - anchor.top) * 7);
```
This is chosen because `top − anchorTop` is invariant under the things that *shouldn't* change the look: scrolling (both shift together), and growing the mark to the right (the line's top doesn't move). The left edge is deliberately **excluded** from the seed so growing leftward doesn't re-roll it. From that one seed, decorrelated values are pulled with offsets:
```js
const hashJitter = (seed) => {                 // deterministic [-1,1], no nondeterministic RNG
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return (x - Math.floor(x)) * 2 - 1;
};
leftExt  = … hashJitter(seed);
rightExt = … hashJitter(seed + 11);
slant    = … hashJitter(seed + 101);
//        top edge uses seed + 200, bottom uses seed + 300, vertices use seed + i*17
```
No nondeterministic randomness anywhere → identical output on server and client (SSR-safe) and across reloads. For static marks the seed derives from the target's stable identity instead of a live selection top.

### 6. Node pool keyed by identity, not array index
Overlays are stored in a `Map` keyed by the line's stable seed, not by loop index:
```js
const overlays = new Map(); // key = line identity, not array index
```
So when the set of visible lines changes (e.g. a highlight grows by a line), surviving lines keep their exact DOM node and CSS - no fade-in flicker, no re-seed.

---

## Why this is exactly what the library needs

The goal is a highlighter effect that is **reusable, reproducible, and flexible.** The anchored-grid method is the property that delivers all three:

| Goal | What the method gives you |
|---|---|
| **Reproducible** | Deterministic from `(seed, absolute coords)` - same input → byte-identical SVG. Enables SSR/hydration with no mismatch and golden-file tests. |
| **Reusable** | The rules are independent of *how* a mark is targeted (selection, element, text-search, page) and *which* renderer tier draws it - they're a property of an internal absolute "mark-space." |
| **Flexible** | Width, reflow, zoom, and font-load all change the mark's extent without disturbing existing geometry - so the same mark animates, wraps, and resizes without ever stretching or swimming. |

## How it generalizes in `@highlighters`

- An internal **absolute-pixel mark-space** with a stable origin per mark (for static marks, derived from the target's stable identity instead of a selection's live top).
- All vertex generation uses **grid index → seed**; all texture uses **fixed-px tile + offset sample**; all caps/radii are **px with min/max clamp**.
- The knobs (`segmentLength`, amplitude, tile size, cap-pool px, corner radius, slant) are configurable, but the *anchoring invariants* are non-optional - they're what make it correct.
- The same seed/grid math is carried into all three renderer tiers so degrading fidelity never changes a mark's identity.
