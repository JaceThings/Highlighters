---
"@highlighters/core": patch
---

Hit the noise-tile cache on ink-knob drags. `buildNoiseTileDataUrl` now quantizes `streakiness`, `feathering`, and `dryout` into 0.02 buckets before both the cache key and the SVG (so they always agree), and a cache hit re-promotes its entry to most-recent, so a continuous drag reuses hot tiles instead of rebuilding the SVG every frame. Knob values not aligned to 0.02 snap to the nearest bucket; `seed` and tile size are untouched.

Also: static-mark `update()` now caches its layout measurement and re-measures only on viewport reflow, range re-collection, or a `snap` change, so option-only updates force no reflow. Performance only, no API change.
