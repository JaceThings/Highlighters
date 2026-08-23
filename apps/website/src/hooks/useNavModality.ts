import { useEffect, useRef, type MutableRefObject } from "react";

const NAV_KEYS = new Set([
  "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

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
