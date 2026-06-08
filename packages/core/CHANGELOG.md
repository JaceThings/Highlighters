# @highlighters/core

## 1.1.0

### Minor Changes

- 079a254: Keep near-white ink visible. A near-white highlight previously vanished under the default `multiply` blend (multiply with white is a no-op); it now adapts to the backdrop behind the mark: a bright wash on dark backgrounds (its own isolated `normal`-blend layer) and a soft off-white on light ones. Saturated colours and any explicit `blendMode` are unchanged.

  Also: export `findSelectionAnchor`, keep live-selection marks aligned on viewport reflow, and guard the renderer against a null overlay container (speed sampling before mount, and the clear-fade timer after teardown).

## 1.0.0

### Major Changes

- Initial public release.
