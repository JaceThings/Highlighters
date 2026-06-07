# @highlighters/svelte

A Svelte action for [`@highlighters/core`](https://www.npmjs.com/package/@highlighters/core) - realistic highlighter-pen marks for web text. Wet-ink colour, organic frayed edges, true multiply-blend optics, drawn over your text without altering it.

## Install

```sh
npm install @highlighters/svelte
```

`@highlighters/core` is bundled in as a dependency, so you do not install it separately. Svelte 3+ is a peer dependency.

## Usage

```svelte
<script>
  import { highlight } from "@highlighters/svelte";
</script>

<p use:highlight={{ color: { palette: "fluorescent", swatch: "yellow" } }}>
  this exact sentence
</p>
```

The action reacts to option changes and cleans up on unmount automatically:

```svelte
<script>
  import { highlight } from "@highlighters/svelte";
  let swatch = "yellow";
</script>

<p use:highlight={{ color: { palette: "mild", swatch } }}>
  Re-inks whenever the bound options change.
</p>
```

## Documentation

Full guides, the options reference, and live demos live at **[highlighte.rs](https://highlighte.rs)** and in the [repository](https://github.com/JaceThings/highlighters).

## License

MIT
