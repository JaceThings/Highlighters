<div align="center">

<h1>highlighters</h1>

Realistic, deeply customizable highlighter-pen marks for web text.
From a single word to a whole page with surgical exclusions — multiline, deterministic, SSR-safe.

[![npm](https://img.shields.io/npm/v/%40highlighters%2Fcore?label=%40highlighters%2Fcore)](https://www.npmjs.com/package/@highlighters/core)
[![bundle](https://deno.bundlejs.com/badge?q=%40highlighters%2Fcore&label=bundle)](https://bundlejs.com/?q=%40highlighters%2Fcore)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

**[highlighte.rs](https://highlighte.rs)**

</div>

## What is this?

A flat `<mark>` background looks like a CSS rectangle, not ink. Sketch-annotation libraries draw the wrong aesthetic. And rolling your own gets you a React-only, selection-only one-off with no blend optics.

`highlighters` draws a **realistic highlighter-pen mark** over any web text — wet-ink colour, organic frayed edges, lengthwise streaking, and true multiplicative ink optics (`mix-blend-mode: multiply`, so overlapping marks darken and dark text stays legible). It scales from one word to an entire page with named exclusions, handles wrapped lines as one continuous swipe, repositions on reflow and web-font load, and never touches your text — so selection and find-in-page keep working.

The mark is tuned in the **vocabulary of real highlighters**: tip type, ink flow ("juiciness"), viscosity, feathering/bleed, streaking, dry-out, end pooling, fluorescence, paper, and a single `colorant` dye↔pigment knob. Pick a one-word preset for the 90% case, or reach all the way down.

## Why it looks right (and never stretches)

Everything is anchored to an **absolute pixel coordinate space**, never normalized to the mark's current size: the noise texture is a fixed-px stitched tile sampled by offset (not scaled), wavy-edge vertices live on a fixed grid seeded by index, and caps/radii are clamped px. Widening a mark adds more of the same — it doesn't stretch what's there — and a mark that's already down stays byte-identical as it grows. All randomness is deterministic from a seed (no `Math.random`), so marks are stable across scroll, reflow, reload, and server rendering. See [the anchored-grid method](./docs/the-anchored-grid-method.md).

## Quick start

### Vanilla

```sh
npm install @highlighters/core
```

```ts
import { highlight } from "@highlighters/core";

// Highlight an element with the default "mild" look.
const handle = highlight("#intro");

// Tune it in real highlighter vocabulary, or just name a preset.
highlight(".key-point", { preset: "wet", color: { palette: "fluorescent", swatch: "pink" } });

// The handle controls the mark's lifecycle.
handle.hide();
handle.show();
handle.update({ preset: "premium" });
handle.remove(); // restores the DOM to its pre-highlight state
```

### React

```sh
npm install @highlighters/react
```

```tsx
import { Highlight } from "@highlighters/react";

function Article() {
  return (
    <p>
      The part that matters most is{" "}
      <Highlight preset="mild" color={{ palette: "fluorescent", swatch: "yellow" }}>
        this exact sentence
      </Highlight>
      .
    </p>
  );
}
```

For Vue, Svelte, or the framework-agnostic core, see the [packages](#packages) below.

## Mark types

All three share one band primitive and the full physics model — they differ only in vertical position and thickness.

| Type | Description |
|---|---|
| `highlight` *(default)* | A tall band over the text. Tip: `chisel` (default), `bullet`, or `fine`. |
| `underline` | A thin, low band beneath the text. |
| `strike-through` | A thin, centred band across the text. |

Box, circle/encircle, and bracket annotations are out of v1 scope.

## Packages

| Package | npm | Description |
|---|---|---|
| `@highlighters/core` | [![npm](https://img.shields.io/npm/v/%40highlighters%2Fcore?label=)](https://www.npmjs.com/package/@highlighters/core) | Framework-agnostic engine: targeting, geometry, renderer tiers, animation |
| `@highlighters/react` | [![npm](https://img.shields.io/npm/v/%40highlighters%2Freact?label=)](https://www.npmjs.com/package/@highlighters/react) | React hook and component |
| `@highlighters/vue` | [![npm](https://img.shields.io/npm/v/%40highlighters%2Fvue?label=)](https://www.npmjs.com/package/@highlighters/vue) | Vue composable and component |
| `@highlighters/svelte` | [![npm](https://img.shields.io/npm/v/%40highlighters%2Fsvelte?label=)](https://www.npmjs.com/package/@highlighters/svelte) | Svelte action |

## Features

- **Target anything** — an element or selector, a `Range` or the live `Selection`, every match of a string/`RegExp`, or the whole page with named exclusions (exclusion always wins over inclusion).
- **Real-highlighter parameter model** — `tip`, `ink` (flow/viscosity/saturation), `feathering`, `streakiness`, `dryout`, bidirectional `startEndBuildup` (pool *or* anti-pool guardrails), `paper`, plus a single `colorant` dye↔pigment master axis.
- **Curated palettes** — harmonized `fluorescent`, `mild`, `vintage`/`neutral`, and `calm` families designed for legible colour-coding; default is fluorescent **yellow**.
- **True ink optics** — `mix-blend-mode: multiply` by default; optional additive fluorescence/glow that reads brighter than the page.
- **Multiline as one swipe** — one band per visual line, shared noise field and seed, wrap edges that overshoot to connect.
- **Three renderer tiers behind one API** — SVG (realistic, default), CSS gradient (lightweight), and the native Custom Highlight API (flat, maximally safe), with principled auto-degrade and a pinnable tier.
- **Snap-to-bounds** — clamp marks to `word`, `line`, or `glyph` so they never overshoot into whitespace.
- **Animation** — draw-on swipe with per-line stagger, built-in `IntersectionObserver` scroll trigger, and automatic suppression under `prefers-reduced-motion`.
- **Robust reflow** — repositions on element/container/window resize, web-font load, and zoom; scroll uses the compositor with zero JS, and idle cost is zero.
- **Accessible by construction** — text is never altered; overlays are `aria-hidden` and non-interactive; selection and find-in-page keep working.
- **SSR-safe & deterministic** — no DOM access at import; identical inputs produce byte-identical marks on server and client; a DOM-free `@highlighters/core/path` subpath ships the pure geometry.
- **Zero runtime dependencies**, ESM + CJS dual export, tree-shakeable.

## Documentation

- [How highlighters work](./docs/how-highlighters-work.md): the real-world physics and engineering the model is grounded in
- [The anchored-grid method](./docs/the-anchored-grid-method.md): why the marks look hand-made but never stretch or swim
- [Buying guide](./docs/buying-guide.md): the best real highlighters to actually buy, by use case
- [Blueprint](./blueprint.md): the full requirements, architecture decisions, and verification plan

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, commands, and the release process, and please read our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE)

---

<div align="center">

Built by [Jace](https://ja.mt)

[X](https://ja.mt/x) | [Bluesky](https://ja.mt/bsky) | [Instagram](https://ja.mt/ig) | [Threads](https://ja.mt/threads)

</div>
