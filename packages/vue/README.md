# @highlighters/vue

Vue bindings for [`@highlighters/core`](https://www.npmjs.com/package/@highlighters/core) - realistic highlighter-pen marks for web text. Wet-ink colour, organic frayed edges, true multiply-blend optics, drawn over your text without altering it.

## Install

```sh
npm install @highlighters/vue
```

`@highlighters/core` is bundled in as a dependency, so you do not install it separately. Vue 3.3+ is a peer dependency.

## Usage

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

`Highlight` renders a `<span>` by default; set `as` for any other tag. For highlighting an element you hold a template ref to, use the composable:

```vue
<script setup>
import { ref } from "vue";
import { useHighlight } from "@highlighters/vue";

const el = ref(null);
useHighlight(el, { color: { palette: "mild", swatch: "blue" } });
</script>

<template><p ref="el">Highlighted on mount, updated when options change.</p></template>
```

## Documentation

Full guides, the options reference, and live demos live at **[highlighte.rs](https://highlighte.rs)** and in the [repository](https://github.com/JaceThings/highlighters).

## License

MIT
