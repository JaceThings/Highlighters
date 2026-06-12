# @highlighters/core

## 1.2.0

### Minor Changes

- 506b8b5: Add a `vivid` option for keeping the ink visible on dark or saturated surfaces, where the default `multiply` optic (`backdrop x ink`) drives a colour toward black and the band disappears. When set, the ink composites on a private escape layer against the page instead of sinking under the shared multiply container. Reuses the existing dark-surface escape path; wins over `blendMode`; keeps the ink's own blend for self-overlaps (a mark crossing itself still darkens); no effect on the flat Tier C (Custom Highlight API) path.

  - `true`: a translucent colour wash (`normal` blend). Deterministic and SSR-safe (no backdrop detection), but the band sits over the text, so light text on a dark surface is muted; pair it with a saturated ink.
  - `"screen"`: composite the band with `screen`. On a dark surface this mirrors `multiply` on light paper: a bright band that keeps light text legible. It washes out on light surfaces.

  Default `false`, so behaviour is unchanged for existing callers.

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
