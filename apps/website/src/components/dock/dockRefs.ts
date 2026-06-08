import type { RefObject } from "react";

// The dock's DOM handles, grouped so the layout/binding hooks can take one bundle instead of a long
// parameter list. All point at the live tray subtree owned by `Dock`.
export interface DockRefs {
  /** The fixed-positioned tray whose box/transform the geometry drives. */
  tray: RefObject<HTMLDivElement | null>;
  /** overflow:hidden wrapper whose radius follows the morph (clips the contents to the shape). */
  clip: RefObject<HTMLDivElement | null>;
  /** Soft feathered mask edge, shown only while the shape morphs. */
  feather: RefObject<HTMLDivElement | null>;
  /** Capsule-white disc behind the carried marker in the circle. */
  backdrop: RefObject<HTMLDivElement | null>;
  /** Bottom-layout content row (measured for sizing + slot offsets). */
  horizontal: RefObject<HTMLDivElement | null>;
  /** Side-layout content column (measured for sizing + slot offsets). */
  vertical: RefObject<HTMLDivElement | null>;
  /** The side layout's rotation-independent pen-box, read for the side slot offset. */
  penBox: RefObject<HTMLDivElement | null>;
  /** Opacity-driven wrapper around the bottom layout. */
  horizontalLayer: RefObject<HTMLDivElement | null>;
  /** Opacity-driven wrapper around the side layout. */
  verticalLayer: RefObject<HTMLDivElement | null>;
}
