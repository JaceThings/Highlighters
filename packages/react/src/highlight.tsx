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

/** Own props of `<Highlight>` independent of the rendered element. */
export type HighlightOwnProps = {
  /** Content to highlight. */
  children?: ReactNode;
  /** Highlight options forwarded to the core `highlight()` pipeline. */
  options?: HighlightOptions;
  /** Optional positioned element to mount the overlay inside (instead of the
   *  body), scoping it to a transformed/scrolling/stacked container. */
  host?: HTMLElement | null;
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
  const { as, options, host, children, ...rest } = props;
  const Component = (as ?? "span") as ElementType;
  // A callback ref into state, so the hook tracks the ACTUAL mounted node: an
  // `as`-element swap or a deferred mount re-runs the hook on the new node rather
  // than stranding the mark on a stale (or never-populated) ref.
  const [node, setNode] = useState<Element | null>(null);
  const ref = useCallback((el: Element | null) => setNode(el), []);

  useHighlight(node, options, host);

  return createElement(Component, { ...rest, ref }, children);
}
