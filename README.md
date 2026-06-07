<div align="center">

<h1>Highlighters</h1>

Realistic, deeply customizable highlighter-pen marks for web text.
From a single word to a whole page: multiline, deterministic, and SSR-safe.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

**[highlighte.rs](https://highlighte.rs)**

</div>

## What it is

Real highlighters lay down wet ink: the colour pools and bleeds, the edges fray, and going over the same spot twice makes it darker. A plain `<mark>` on the web gives you a flat coloured box instead. This library draws the real thing.

Point it at any text on the page, from a single word to the whole document, and it paints a highlighter stroke over the top. It never touches your actual text, so selecting, copying, and find-in-page all keep working. Wrapped lines join into one continuous swipe, marks redraw themselves when the layout shifts, and everything renders the same on the server as in the browser.

Reach for the defaults and one line of code gives you a tasteful mark. Want more control? Tune it like a real pen: tip shape, ink flow, bleed, streaking, dry-out, paper texture, blend mode, and a set of curated colour palettes.

## Quick start

### Vanilla

```sh
npm install @highlighters/core
```

```ts
import { highlight } from "@highlighters/core";

// Highlight an element with the default mild look.
const handle = highlight("#intro");

// Tune it in real highlighter vocabulary, or just name a palette swatch.
highlight(".key-point", {
  color: { palette: "fluorescent", swatch: "pink" },
  ink: { flow: 0.7, feathering: 0.4 }, // juicier, softer edges
});

// The handle controls the mark's lifecycle.
handle.hide();
handle.show();
handle.update({ color: { palette: "mild", swatch: "blue" } });
handle.remove(); // restores the DOM to its pre-highlight state
```

Other front doors: `highlightAll()` marks the whole page (honouring `data-highlight` and include/exclude), and `highlightSelection()` paints the user's live selection in real time.

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
      <Highlight options={{ color: { palette: "fluorescent", swatch: "yellow" } }}>
        this exact sentence
      </Highlight>
      .
    </p>
  );
}
```

There is also a `useHighlight(ref, options)` hook for highlighting an existing element by ref.

### Vue

```sh
npm install @highlighters/vue
```

```vue
<script setup>
import { Highlight } from "@highlighters/vue";
</script>

<template>
  <p>
    The part that matters most is
    <Highlight :options="{ color: { palette: 'fluorescent', swatch: 'yellow' } }">
      this exact sentence
    </Highlight>.
  </p>
</template>
```

A `useHighlight(elRef, options)` composable is exported too.

### Svelte

```sh
npm install @highlighters/svelte
```

```svelte
<script>
  import { highlight } from "@highlighters/svelte";
</script>

<p>
  The part that matters most is
  <span use:highlight={{ color: { palette: "fluorescent", swatch: "yellow" } }}>
    this exact sentence
  </span>.
</p>
```

Every framework package re-exports the core types and depends on `@highlighters/core`, so you do not install it separately.

## Mark types

They all share one band primitive and the full physics model - they differ only in vertical position and thickness.

| Type | Description |
|---|---|
| `highlight` *(default)* | A tall band over the text. Tip: `chisel` (default), `bullet`, or `fine`. |
| `underline` | A thin, low band beneath the text. |
| `overline` | A thin band above the text. |
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

- **Target anything** - an element or selector, a `Range` or the live `Selection`, every match of a string/`RegExp`, or the whole page with named exclusions (exclusion always wins over inclusion).
- **Real-highlighter parameter model** - `tip` (type/angle/overshoot), `ink` (flow, viscosity, feathering, streakiness, dryout, bidirectional `startEndBuildup` for pooling *or* anti-pool guardrails, directional `flowFade`), `edge` (waviness/roughness/cap/radius), and `paper` absorbency.
- **Curated palettes** - harmonized `fluorescent`, `mild`, `vintage`, `neutral`, and `calm` families designed for legible colour-coding; default is **mild yellow**. Pass a `{ palette, swatch }` reference, any CSS colour string, or a gradient.
- **True ink optics** - `mix-blend-mode: multiply` by default; optional additive fluorescence/glow that reads brighter than the page.
- **Multiline as one swipe** - one band per visual line, shared noise field and seed, wrap edges that overshoot to connect.
- **Three renderer tiers behind one API** - SVG (realistic, default), CSS gradient (lightweight), and the native Custom Highlight API (flat, maximally safe), with principled auto-degrade and a pinnable tier.
- **Snap-to-bounds** - clamp marks to `word`, `line`, or `glyph` so they never overshoot into whitespace.
- **Animation** - draw-on swipe with per-line stagger, built-in `IntersectionObserver` scroll trigger, and automatic suppression under `prefers-reduced-motion`.
- **Robust reflow** - repositions on element/container/window resize, web-font load, and zoom; scroll uses the compositor with zero JS, and idle cost is zero.
- **Accessible by construction** - text is never altered; overlays are `aria-hidden` and non-interactive; selection and find-in-page keep working.
- **SSR-safe & deterministic** - no DOM access at import; identical inputs produce byte-identical marks on server and client; a DOM-free `@highlighters/core/path` subpath ships the pure geometry.
- **Zero runtime dependencies**, ESM + CJS dual export, tree-shakeable.

## Documentation

Full guides and reference live in the [**Highlighters Wiki**](https://github.com/JaceThings/Highlighters/wiki):

- [Getting Started](https://github.com/JaceThings/Highlighters/wiki/Getting-Started): install and quick start for vanilla, React, Vue, and Svelte
- [Which API Should I Use](https://github.com/JaceThings/Highlighters/wiki/Which-API-Should-I-Use): element vs selection vs page, and picking a renderer tier
- [Options Reference](https://github.com/JaceThings/Highlighters/wiki/Options-Reference): every option, its default, and what it does
- [Ink and Optics](https://github.com/JaceThings/Highlighters/wiki/Ink-and-Optics) and [Color and Palettes](https://github.com/JaceThings/Highlighters/wiki/Color-and-Palettes): the real-highlighter parameter model
- [API Reference](https://github.com/JaceThings/Highlighters/wiki/API-Reference): exported functions, handles, and framework bindings
- [How It Works](https://github.com/JaceThings/Highlighters/wiki/How-It-Works), [Performance](https://github.com/JaceThings/Highlighters/wiki/Performance), and [SSR Support](https://github.com/JaceThings/Highlighters/wiki/SSR-Support)
- [Recipes](https://github.com/JaceThings/Highlighters/wiki/Recipes): common patterns in every framework

Design essays in this repo:

- [How highlighters work](./docs/how-highlighters-work.md): the real-world physics and engineering the model is grounded in
- [The anchored-grid method](./docs/the-anchored-grid-method.md): why the marks look hand-made but never stretch or swim
- [Buying guide](./docs/buying-guide.md): the best real highlighters to actually buy, by use case

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, commands, and the release process, and please read our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE)

---

<div align="center">

Built by [Jace](https://ja.mt)

[X](https://ja.mt/x) | [Bluesky](https://ja.mt/bsky) | [Instagram](https://ja.mt/ig) | [Threads](https://ja.mt/threads)

</div>
