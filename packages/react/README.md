# @highlighters/react

React bindings for [`@highlighters/core`](https://www.npmjs.com/package/@highlighters/core) - realistic highlighter-pen marks for web text. Wet-ink colour, organic frayed edges, true multiply-blend optics, drawn over your text without altering it.

## Install

```sh
npm install @highlighters/react
```

`@highlighters/core` is bundled in as a dependency, so you do not install it separately. React 18+ is a peer dependency.

## Usage

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

`Highlight` is polymorphic via `as` (defaults to `<span>`). For highlighting an existing element you already hold a ref to, use the hook:

```tsx
import { useRef } from "react";
import { useHighlight } from "@highlighters/react";

function Note() {
  const ref = useRef<HTMLParagraphElement>(null);
  useHighlight(ref, { color: { palette: "mild", swatch: "blue" } });
  return <p ref={ref}>Highlighted on mount, updated when options change.</p>;
}
```

## Documentation

Full guides, the options reference, and live demos live at **[highlighte.rs](https://highlighte.rs)** and in the [repository](https://github.com/JaceThings/highlighters).

## License

MIT
