# @highlighters/core

## 1.1.2

### Patch Changes

- e62c4e6: The live selection marker now honors `data-highlight-exclude`. Because the marker paints by range geometry, which covers `user-select: none` text too, a select-all (Cmd+A) previously banded over opted-out subtrees. Such subtrees are now carved out of the painted ranges, while the runs around them keep their exact geometry.

## 1.1.1

### Patch Changes

- d287778: Hit the noise-tile cache on ink-knob drags. `buildNoiseTileDataUrl` now quantizes `streakiness`, `feathering`, and `dryout` into 0.02 buckets before both the cache key and the SVG (so they always agree), and a cache hit re-promotes its entry to most-recent, so a continuous drag reuses hot tiles instead of rebuilding the SVG every frame. Knob values not aligned to 0.02 snap to the nearest bucket; `seed` and tile size are untouched.

  Also: static-mark `update()` now caches its layout measurement and re-measures only on viewport reflow, range re-collection, or a `snap` change, so option-only updates force no reflow. Performance only, no API change.

## 1.1.0

### Minor Changes

- 079a254: Keep near-white ink visible. A near-white highlight previously vanished under the default `multiply` blend (multiply with white is a no-op); it now adapts to the backdrop behind the mark: a bright wash on dark backgrounds (its own isolated `normal`-blend layer) and a soft off-white on light ones. Saturated colours and any explicit `blendMode` are unchanged.

  Also: export `findSelectionAnchor`, keep live-selection marks aligned on viewport reflow, and guard the renderer against a null overlay container (speed sampling before mount, and the clear-fade timer after teardown).

## 1.0.0

### Major Changes

- Initial public release.
