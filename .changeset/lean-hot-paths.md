---
"@highlighters/core": patch
---

Trim the render and measure hot paths. `highlight()` no longer computes an anchor before measuring, so each range's rects are read in a single layout pass instead of two; `rangesToLineRects` takes the anchor as optional and falls back to the `columnBounds` the caller already supplies. Style writes now go through a per-element cache, so a re-render that resolves to the same declaration skips the DOM write. The clip-path builder walks edge vertices directly instead of materialising two intermediate arrays per frame, and `buildMarkGeometry` shifts edges into mark space in place.

No API change. `computeAnchor` stays exported for callers that measure a column themselves.
