---
"@highlighters/core": patch
---

Bug fixes found while profiling:

- Lines that share a top edge (table cells, columns, flex rows) now each get their own band; previously they collided on one seed and only the first was painted.
- `highlightAll` no longer re-measures the page in response to its own overlay insertions, so mounting is one layout pass instead of two.
- `highlightSelection` in vivid mode now moves the blend escape layer along with the overlay when the selection jumps to a different positioned ancestor, instead of leaving stale bands under the old one.
- Named easing lookup no longer resolves prototype keys such as `constructor`, and a `null` color from JS callers falls back to the palette instead of throwing.
