import { useEffect, useRef, type MutableRefObject } from "react";

// Nav keys count as keyboard modality; activation keys (Enter/Space/Escape) don't, or they'd re-flag
// the ring on the next programmatic .focus(). Modifier + key is a browser shortcut, not in-page nav.
const NAV_KEYS = new Set([
  "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

/** Ref tracking whether the last input was keyboard navigation rather than a pointer. */
export function useNavModality(): MutableRefObject<boolean> {
  const keyboard = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (NAV_KEYS.has(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) keyboard.current = true;
    };
    const onPointer = () => {
      keyboard.current = false;
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  return keyboard;
}
