import { useEffect, useRef, type MutableRefObject } from "react";

// Navigation keys count as keyboard modality; activation keys (Enter/Space/Escape) don't,
// or they'd re-flag the ring on the next programmatic .focus(). Modifier + key is a
// browser shortcut, not in-page navigation.
const NAV_KEYS = new Set([
  "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

/** Tracks whether the last input was keyboard navigation rather than a pointer, as a ref
 *  so reads inside event handlers stay current without re-rendering. Shared by the focus
 *  ring and the dock's marker outline so they agree on what counts as "keyboard". */
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
