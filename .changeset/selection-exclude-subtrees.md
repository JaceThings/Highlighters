---
"@highlighters/core": patch
---

The live selection marker now honors `data-highlight-exclude`. Because the marker paints by range geometry, which covers `user-select: none` text too, a select-all (Cmd+A) previously banded over opted-out subtrees. Such subtrees are now carved out of the painted ranges, while the runs around them keep their exact geometry.
