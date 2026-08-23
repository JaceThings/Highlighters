import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { playMenuOpen, playMenuClose } from "../../lib/marker-audio.ts";

const POPOVER_W = 320;

export interface Popover {
  kind: "marker" | "color";
  x: number;
  y: number;
}

export function useDockPopover({
  trayRef,
  color,
  setColor,
  showColors,
}: {
  trayRef: RefObject<HTMLDivElement | null>;
  color: string;
  setColor: (color: string) => void;
  showColors: boolean;
}) {
  const [popover, setPopover] = useState<Popover | null>(null);
  const open = popover !== null;
  const lastCustom = useRef("#a855f7");

  const prevKind = useRef<string | null>(null);
  useEffect(() => {
    const kind = popover?.kind ?? null;
    const prev = prevKind.current;
    if (kind && kind !== prev) playMenuOpen();
    else if (!kind && prev) playMenuClose();
    prevKind.current = kind;
  }, [popover]);

  const centerOf = useCallback(
    (button: HTMLButtonElement) => {
      const tray = trayRef.current;
      if (!tray) return null;
      const a = button.getBoundingClientRect();
      const b = tray.getBoundingClientRect();
      const half = POPOVER_W / 2;
      const x = Math.max(half, Math.min(b.width - half, a.left + a.width / 2 - b.left));
      const y = a.top + a.height / 2 - b.top;
      return { x, y };
    },
    [trayRef],
  );

  const close = useCallback(() => setPopover(null), []);

  const handleActivate = useCallback(
    (button: HTMLButtonElement) => {
      const c = centerOf(button);
      if (!c) return;
      setPopover((prev) => (prev?.kind === "marker" ? null : { kind: "marker", ...c }));
    },
    [centerOf],
  );

  const handleActivateCustom = useCallback(
    (button: HTMLButtonElement) => {
      const c = centerOf(button);
      if (!c) return;
      setPopover((prev) => (prev?.kind === "color" ? null : { kind: "color", ...c }));
      if (color !== lastCustom.current) setColor(lastCustom.current);
    },
    [centerOf, setColor, color],
  );

  const handleCustomColor = useCallback(
    (hex: string) => {
      lastCustom.current = hex;
      setColor(hex);
    },
    [setColor],
  );

  const handleSelectColor = useCallback(
    (next: string) => {
      setColor(next);
      setPopover((prev) => (prev?.kind === "color" ? null : prev));
    },
    [setColor],
  );

  useEffect(() => {
    if (!showColors) setPopover((prev) => (prev?.kind === "color" ? null : prev));
  }, [showColors]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!trayRef.current?.contains(e.target as Node)) setPopover(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, trayRef]);

  return { popover, close, handleActivate, handleActivateCustom, handleCustomColor, handleSelectColor };
}
