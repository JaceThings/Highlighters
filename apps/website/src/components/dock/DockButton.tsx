import type { ReactNode } from "react";

const CLASSES =
  "flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[#efeeed] text-[#7e756c] transition-[background-color,transform] duration-150 hover:bg-[#e6e4e1] active:scale-90";

/** A 42px round tool-tray button: light fill, muted glyph. The disabled Home
 *  button is shown by dimming the glyph, not the fill. With `href` it renders as
 *  an external link instead of a button, sharing identical styling. */
export function DockButton({
  children,
  label,
  dimmed,
  onClick,
  href,
}: {
  children: ReactNode;
  label: string;
  dimmed?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const glyph = (
    <span
      className="flex items-center justify-center"
      style={{ opacity: dimmed ? 0.25 : 1 }}
    >
      {children}
    </span>
  );

  if (href !== undefined) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        onClick={onClick}
        data-focus-ring
        className={CLASSES}
      >
        {glyph}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      data-focus-ring
      className={CLASSES}
    >
      {glyph}
    </button>
  );
}
