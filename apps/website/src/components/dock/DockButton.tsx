import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

const CLASSES =
  "flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[#efeeed] text-[#7e756c] transition-[background-color,transform] duration-200 ease-out-quint hover:bg-[#e6e4e1] active:scale-[0.96]";

/** Tool-tray button: `to` renders a router Link, `href` an external anchor, else a
 *  plain button - all share one style. */
export function DockButton({
  children,
  label,
  active,
  href,
  to,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  href?: string;
  to?: "/" | "/docs";
}) {
  const glyph = (
    <span
      className="flex items-center justify-center transition-opacity duration-300 ease-out-quint"
      style={{ opacity: active ? 0.25 : 1 }}
    >
      {children}
    </span>
  );

  if (to !== undefined) {
    return (
      <Link
        to={to}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        data-focus-ring
        data-focus-radius="full"
        className={CLASSES}
      >
        {glyph}
      </Link>
    );
  }

  if (href !== undefined) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        data-focus-ring
        data-focus-radius="full"
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
      data-focus-ring
      data-focus-radius="full"
      className={CLASSES}
    >
      {glyph}
    </button>
  );
}
