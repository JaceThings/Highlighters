---
"@highlighters/core": patch
---

Skip the SVG edge filter in Firefox once devicePixelRatio passes 2 (zooming on a retina display). Gecko rasterizes SVG filters in software at device resolution, which made zoomed highlighting crawl; marks keep their clip shape and pool gradient and only lose the frayed edge while zoomed.
