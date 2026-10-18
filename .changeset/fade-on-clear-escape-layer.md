---
"@highlighters/core": patch
---

`fadeOnClear` now fades the bands wherever they are painted. When the ink plan puts the bands in a blend escape layer beside the overlay container (vivid mode, or a backdrop that needs a different blend), the fade used to target only the container, so the visible highlight vanished instantly. Renderers now expose the active escape layer as `layer`, and the clear fade transitions both elements.
