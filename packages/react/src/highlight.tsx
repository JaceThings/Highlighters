import {
  createElement,
  useCallback,
  useState,
  type ElementType,
  type ReactNode,
  type ComponentPropsWithoutRef,
} from "react";
import { useHighlight } from "./use-highlight.js";
import type { HighlightOptions } from "@highlighters/core";

export type HighlightOwnProps = {
  children?: ReactNode;
  options?: HighlightOptions;
  /** Positioned element to mount the overlay inside, instead of the body. */
  host?: HTMLElement | null;
};

type ReservedKeys = keyof HighlightOwnProps | "as";

/** Polymorphic via `as` (default `<span>`), which determines available HTML attributes. */
export type HighlightProps<E extends ElementType = "span"> = HighlightOwnProps & {
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, ReservedKeys>;

/**
 * Renders an element whose text content is highlighted with a decorative overlay mark.
 *
 * @example
 * ```tsx
 * <Highlight as="p" options={{ preset: "wet", color: "pink" }}>
 *   Highlight this paragraph
 * </Highlight>
 * ```
 */
export function Highlight<E extends ElementType = "span">(props: HighlightProps<E>) {
  const { as, options, host, children, ...rest } = props;
  const Component = (as ?? "span") as ElementType;
  // Callback ref into state so the hook tracks the actual mounted node across as-swaps.
  const [node, setNode] = useState<Element | null>(null);
  const ref = useCallback((el: Element | null) => setNode(el), []);

  useHighlight(node, options, host);

  return createElement(Component, { ...rest, ref }, children);
}
