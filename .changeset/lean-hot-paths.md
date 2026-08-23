---
"@highlighters/core": major
---

Remove the `shape` option and the `ShapeType` type. Both were undocumented aliases for `markType` and `MarkType`; `mergeOptions` already resolved `shape` into `markType` and deleted it, so the alias only ever added a second word for one concept. Callers passing `shape` should pass `markType`, and anyone importing `ShapeType` should import `MarkType`.

Trim the render and measure hot paths. `highlight()` no longer computes an anchor before measuring, so each range's rects are read in a single layout pass instead of two; `rangesToLineRects` takes the anchor as optional and falls back to the `columnBounds` the caller already supplies. Style writes now go through a per-element cache, so a re-render that resolves to the same declaration skips the DOM write. The clip-path builder walks edge vertices directly instead of materialising two intermediate arrays per frame, and `buildMarkGeometry` shifts edges into mark space in place.

Style writes also moved from a camelCase index behind a type assertion to `el.style.setProperty()` with real CSS property names, and `mergeRectsByLine` now returns real `DOMRect` instances instead of object literals shaped like one.

`findSelectionAnchor` now skips a positioned ancestor that is not an `HTMLElement` rather than returning it as one. This is only reachable through a positioned SVG ancestor, where the previous result could not host an overlay anyway.
