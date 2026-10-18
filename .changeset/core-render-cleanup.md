---
"@highlighters/core": patch
---

Internal cleanup with no API change. The SVG and CSS renderers now share one band reconciliation loop, text search indexes text nodes by cumulative offset instead of allocating a slot per character, and dead environment guards were removed. Core bundle shrinks by about 1 kB brotli.
