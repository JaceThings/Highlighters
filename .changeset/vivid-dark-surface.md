---
"@highlighters/core": minor
---

Add a `vivid` option for keeping the ink visible on dark or saturated surfaces, where the default `multiply` optic (`backdrop x ink`) drives a colour toward black and the band disappears. When set, the ink composites on a private escape layer against the page instead of sinking under the shared multiply container. Reuses the existing dark-surface escape path; wins over `blendMode`; keeps the ink's own blend for self-overlaps (a mark crossing itself still darkens); no effect on the flat Tier C (Custom Highlight API) path.

- `true`: a translucent colour wash (`normal` blend). Deterministic and SSR-safe (no backdrop detection), but the band sits over the text, so light text on a dark surface is muted; pair it with a saturated ink.
- `"screen"`: composite the band with `screen`. On a dark surface this mirrors `multiply` on light paper: a bright band that keeps light text legible. It washes out on light surfaces.

Default `false`, so behaviour is unchanged for existing callers.
