import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { playMenuOpen, playMenuClose } from "../../lib/marker-audio.ts";

// Both popovers are this wide; clamps a centred bottom popover inside the tray.
const POPOVER_W = 320;

export interface Popover {
  kind: "marker" | "color";
  /** Activating button's centre relative to the tray (x clamped for the bottom layout). */
  x: number;
  y: number;
}

// The dock's popover state machine: which popover is open and where, the open/close sounds, the
// outside-press / Escape dismissal, and auto-close when the colour palette is shed. Returns the
// state plus the activator handlers `Dock` wires onto the marker / custom-colour buttons.
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
  // Last custom ink, so reopening the picker returns to it from a preset swatch.
  const lastCustom = useRef("#a855f7");

  // Bloop on appear (open or switch kind); reversed bloop on close.
  const prevKind = useRef<string | null>(null);
  useEffect(() => {
    const kind = popover?.kind ?? null;
    const prev = prevKind.current;
    if (kind && kind !== prev) playMenuOpen();
    else if (!kind && prev) playMenuClose();
    prevKind.current = kind;
  }, [popover]);

  // Centre of `button` relative to the tray. x is clamped so a centred bottom popover stays inside.
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
      // Seed the picker from the remembered custom ink when leaving a preset.
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

  // A preset swatch closes the picker; it replaces the custom ink.
  const handleSelectColor = useCallback(
    (next: string) => {
      setColor(next);
      setPopover((prev) => (prev?.kind === "color" ? null : prev));
    },
    [setColor],
  );

  // If a shrink hides the colour palette, close its popover.
  useEffect(() => {
    if (!showColors) setPopover((prev) => (prev?.kind === "color" ? null : prev));
  }, [showColors]);

  // Close on Escape or a press outside the tray. The popover is a tray DOM child, so clicks on it keep it open.
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

  return { popover, open, close, handleActivate, handleActivateCustom, handleCustomColor, handleSelectColor };
}
