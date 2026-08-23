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
  host?: HTMLElement | null;
};

type ReservedKeys = keyof HighlightOwnProps | "as";

export type HighlightProps<E extends ElementType = "span"> = HighlightOwnProps & {
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, ReservedKeys>;

export function Highlight<E extends ElementType = "span">(props: HighlightProps<E>) {
  const { as, options, host, children, ...rest } = props;
  const Component = (as ?? "span") as ElementType;
  const [node, setNode] = useState<Element | null>(null);
  const ref = useCallback((el: Element | null) => setNode(el), []);

  useHighlight(node, options, host);

  return createElement(Component, { ...rest, ref }, children);
}
