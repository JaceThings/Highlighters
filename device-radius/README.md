# device-radius

Detect an iPhone's **screen corner radius** from the browser, and round your drawers, toasts, and
sheets to match the hardware.

Apple does not expose the device model or its corner radius through any web API. The UA string only
ever says `iPhone`, never the model. So this infers the radius by combining three signals:

1. **`navigator.userAgent`** — confirms it's an iPhone and extracts the iOS version
2. **`screen.width` / `screen.height`** — the logical viewport, in CSS px (orientation-normalized)
3. **`window.devicePixelRatio`** — always 2 or 3 on iPhone

Radii are returned in **CSS px, which equal points on iOS**, so there's nothing to convert. The
underlying point values come from public research into iOS's private `_displayCornerRadius` display
property; this library just maps a browser fingerprint onto them.

## Install

It's a single file with zero dependencies. Copy whichever you need into your project:

- `deviceRadius.ts` — TypeScript source (exports types)
- `deviceRadius.js` — plain ESM, no build step

```ts
import { detectDeviceRadius, innerRadius, applyRadiusTokens } from "./deviceRadius";
```

Run `applyRadiusTokens()` once, ideally in `<head>` before paint, to avoid a flash of the wrong
radius:

```html
<script type="module">
  import { applyRadiusTokens } from "./deviceRadius.js";
  applyRadiusTokens();
</script>
```

Then style with the tokens it sets on `<html>`:

```css
.sheet {
  border-top-left-radius: var(--device-screen-radius);
  border-top-right-radius: var(--device-screen-radius);
}
.toast { border-radius: var(--device-radius-sm); }
.modal { border-radius: var(--device-radius-md); }
```

## API

### `detectDeviceRadius(): DeviceRadiusResult`

Memoized (recomputed only while a simulated viewport is set).

```ts
type DeviceRadiusResult = {
  isIphone: boolean;
  screenCornerRadius: number;   // CSS px (= pt on iOS)
  confidence: "exact" | "high" | "low";
  tier: "flat" | "rounded" | "rounder" | "rounder-max" | "very-round" | "most-round" | "unknown";
  iosVersion: number | null;
  viewport: { w: number; h: number; dpr: number };
  note?: string;                // explains the ambiguity when confidence is low
};
```

Non-iPhones return `{ isIphone: false, screenCornerRadius: 0, confidence: "exact", tier: "flat" }`
— a flat fallback, so it's safe to use everywhere.

### `innerRadius(screenRadius, inset): number`

`max(0, screenRadius - inset)`. The radius for an element inset from the screen edge, so its curve
stays **concentric** with the screen's:

```ts
innerRadius(55, 16); // 39
```

Use this for cards/sheets that sit a fixed distance inside the screen bezel. Use the **preset
tokens** (`--device-radius-sm` / `-md`) for free-floating UI (toasts, popups) that isn't pinned to
the edge — they scale with the tier rather than the literal screen radius.

### `applyRadiusTokens(root?)`

Sets, on `root` (default `<html>`):

| Token | Value |
|---|---|
| `--device-screen-radius` | the detected radius, e.g. `55px` |
| `--device-radius-sm` | toast/chip scale, `8–20px` by tier |
| `--device-radius-md` | card/modal scale, `12–28px` by tier |
| `--device-radius-drawer` | `calc(var(--device-screen-radius) - var(--drawer-inset, 0px))` |
| `--device-radius-confidence` | `exact` / `high` / `low` |

## Confidence and the known ambiguities

Be honest with yourself about this: several viewport + DPR combinations map to **multiple models
with different radii**, and the iOS version narrows but does not fully resolve them (a new model and
an old one can run the same iOS). When candidates disagree, the library returns the **lower** radius
(the conservative estimate) and flags `confidence: "low"` with a `note`.

| Confidence | Meaning |
|---|---|
| `exact` | One model (or a group that all share one radius) matches this fingerprint. |
| `high` | A small group matches; they agree on the radius. |
| `low` | The fingerprint maps to models with **different** radii; lower value returned. |

The headline collision is **`390 × 844 @ DPR 3`**, which covers iPhone 12 / 13 / 14 / 16e (47.33pt)
*and* iPhone 15 / 16 (55pt). On iOS ≤ 16 it resolves to 47.33pt `high` (15/16 need iOS 17+); on
iOS 17+ it stays ambiguous → 47.33pt `low`. A second, smaller collision is `375 × 812 @ 3`
(X/XS/11 Pro at 39pt vs 12 mini/13 mini at 47.33pt), resolved by iOS version where possible.

## The squircle caveat

This library gives you the correct radius **magnitude**. It does **not** reproduce the *curve
shape*. CSS `border-radius` draws circular arcs; Apple's hardware and UIKit use **superellipses**
(squircles), which are visibly smoother at the corner. There is no shipping CSS solution for this
yet — `corner-shape` is unshipped. So a sheet rounded with `border-radius` and these values will
read as the right size but not be pixel-identical to a native iOS corner. If you need the true
shape, feed the magnitude into a superellipse path renderer (`clip-path: path(...)`) instead of
`border-radius`.

## Browser support

Works in all modern browsers. The core detection is pure JS (UA + `screen` + `devicePixelRatio`).
On Safari, `env(safe-area-inset-*)` is a useful supplementary signal (a large top inset confirms a
notched/Dynamic-Island device), but it isn't required for the core result.

## Testing without a device

Set `window.__simulatedViewport = { w, h, dpr, ios }` and call `detectDeviceRadius()` again — it
skips the cache while a simulation is set. The included `index.html` is a self-contained demo with
buttons for each tier (open it directly in a browser, no build).
