import type { RefObject } from "react";

export interface DockRefs {
  tray: RefObject<HTMLDivElement | null>;
  clip: RefObject<HTMLDivElement | null>;
  feather: RefObject<HTMLDivElement | null>;
  backdrop: RefObject<HTMLDivElement | null>;
  horizontal: RefObject<HTMLDivElement | null>;
  vertical: RefObject<HTMLDivElement | null>;
  penBox: RefObject<HTMLDivElement | null>;
  horizontalLayer: RefObject<HTMLDivElement | null>;
  verticalLayer: RefObject<HTMLDivElement | null>;
}
