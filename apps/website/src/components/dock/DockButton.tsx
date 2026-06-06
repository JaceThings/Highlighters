import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookIcon, HomeIcon, PersonIcon, StarIcon } from "../../icons/sf/index.tsx";
import { playNavHome, playNavDocs, primeMarkerAudio } from "../../lib/marker-audio.ts";

const GITHUB_URL = "https://github.com/JaceThings/highlighters";
const FOLLOW_URL = "https://ja.mt";

const CLASSES =
  "flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[#efeeed] text-[#7e756c] transition-[background-color,transform] duration-200 ease-out-quint hover:bg-[#e6e4e1] active:scale-[0.96]";

/** Tool-tray button: `to` -> router Link, `href` -> external anchor, else a plain button, all one style. */
function DockButton({
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
        onPointerEnter={primeMarkerAudio}
        onClick={() => {
          if (active) return; // already here, no navigation -> no sound
          if (to === "/") playNavHome();
          else playNavDocs();
        }}
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

/** Home / Docs route buttons, shared by the desktop and mobile docks. */
export function DockNav({ pathname, className }: { pathname: string; className?: string }) {
  return (
    <nav className={`flex items-center gap-[12px] ${className ?? ""}`}>
      <DockButton to="/" label="Home" active={pathname === "/"}>
        <HomeIcon />
      </DockButton>
      <DockButton to="/docs" label="Docs" active={pathname === "/docs"}>
        <BookIcon />
      </DockButton>
    </nav>
  );
}

/** GitHub / follow external-link buttons, shared by the desktop and mobile docks. */
export function DockLinks({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-[12px] ${className ?? ""}`}>
      <DockButton label="Star" href={GITHUB_URL}>
        <StarIcon />
      </DockButton>
      <DockButton label="Follow" href={FOLLOW_URL}>
        <PersonIcon />
      </DockButton>
    </div>
  );
}
