import {
  createElement,
  useRef,
  type ElementType,
  type ReactNode,
  type ComponentPropsWithoutRef,
} from "react";
import { useHighlight } from "./use-highlight.js";
import type { HighlightOptions } from "@highlighters/core";

/** Own props of `<Highlight>` independent of the rendered element. */
export type HighlightOwnProps = {
  /** Content to highlight. */
  children?: ReactNode;
  /** Highlight options forwarded to the core `highlight()` pipeline. */
  options?: HighlightOptions;
};

/** Keys `<Highlight>` consumes itself; never forwarded to the DOM element. */
type ReservedKeys = keyof HighlightOwnProps | "as";

/**
 * Props for `<Highlight>`. The element passed via `as` determines the available
 * HTML attributes (polymorphic, defaulting to `<span>`).
 */
export type HighlightProps<E extends ElementType = "span"> = HighlightOwnProps & {
  /** The element to render. Default: `"span"`. */
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, ReservedKeys>;

/**
 * Renders an element whose text content is highlighted with a realistic
 * highlighter mark. A thin wrapper over {@link useHighlight} (blueprint A1): the
 * mark is created on mount, updated when `options` change, and removed on
 * unmount, all delegated to the core pipeline. The wrapped element keeps its
 * text intact and selectable (R29) — the mark is a decorative overlay.
 *
 * @example
 * ```tsx
 * <Highlight as="p" options={{ preset: "wet", color: "pink" }}>
 *   Highlight this paragraph
 * </Highlight>
 * ```
 */
export function Highlight<E extends ElementType = "span">(props: HighlightProps<E>) {
  const { as, options, children, ...rest } = props;
  const Component = (as ?? "span") as ElementType;
  const ref = useRef<HTMLElement>(null);

  useHighlight(ref, options);

  return createElement(Component, { ...rest, ref }, children);
}
