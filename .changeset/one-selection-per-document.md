---
"@highlighters/core": patch
---

`highlightSelection` now keeps one instance per document: calling it again removes the previous one instead of stacking a second listener and escape layer. Sites that re-run their setup on every client-side navigation (Astro's `astro:page-load`, Turbo, etc.) were painting every selection once per visited page, which read as the mark getting darker with each navigation.
