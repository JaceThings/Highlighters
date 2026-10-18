---
"@highlighters/core": minor
---

Drop the per-mark noise mask. It resolved to fully opaque alpha in every engine, so it never changed the look, yet Firefox re-rasterized it in software on every paint and zoom. Removes `buildNoiseTile`, `buildNoiseTileDataUrl`, the `NoiseTile` and `MaskOffset` types, and `MarkGeometry.noiseTile` / `maskOffset`.
