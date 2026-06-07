# @highlighters/core

Realistic highlighter-pen marks for web text. Wet-ink colour, organic frayed edges, and true multiply-blend optics so overlapping marks darken and dark text stays readable. It draws over your text without touching it, so selection and find-in-page keep working.

Framework-agnostic, zero runtime dependencies, SSR-safe. This is the engine; for framework bindings see [`@highlighters/react`](https://www.npmjs.com/package/@highlighters/react), [`@highlighters/vue`](https://www.npmjs.com/package/@highlighters/vue), and [`@highlighters/svelte`](https://www.npmjs.com/package/@highlighters/svelte).

## Install

```sh
npm install @highlighters/core
```

## Usage

```ts
import { highlight } from "@highlighters/core";

// Highlight an element with the default mild-yellow look.
const handle = highlight("#intro");

// Or tune it: name a palette swatch, or reach for the full ink model.
highlight(".key-point", {
  color: { palette: "fluorescent", swatch: "pink" },
  ink: { flow: 0.7, feathering: 0.4 },
});

handle.update({ color: { palette: "mild", swatch: "blue" } });
handle.hide();
handle.show();
handle.remove(); // restores the DOM to its pre-highlight state
```

`highlightAll()` marks the whole page (honouring `data-highlight` and include/exclude), and `highlightSelection()` paints the user's live selection in real time.

### SSR-safe geometry subpath

`@highlighters/core/path` ships the pure, DOM-free geometry and config helpers. It never touches `window`/`document` at import, so it is safe to pull into server bundles.

## Documentation

Full guides, the options reference, and live demos live at **[highlighte.rs](https://highlighte.rs)** and in the [repository](https://github.com/JaceThings/highlighters).

## License

MIT
