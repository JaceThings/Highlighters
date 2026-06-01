import { useEffect, useRef, useState } from "react";

// The npm packages, one per line — monospace, each row a click-to-copy control:
// a faint copy glyph at the trailing edge brightens on hover/focus and flips to a
// check for a beat after a copy.
//
// WEIGHT: only a single SF Mono 500 face is loaded and `font-synthesis: none` is
// set globally, so font-weight can't thicken the names next to the Inter-500 body.
// A hairline text-stroke (NAME_STROKE) adds the apparent weight — paint-only, so
// the grid is untouched (each row stays h-6).

const RESET_MS = 1600;
const NAME_STROKE = "0.3px";

// Hairline emboldening for the single-weight mono face — see the note above.
const NAME_WEIGHT_STYLE = { WebkitTextStroke: `${NAME_STROKE} currentColor` } as const;

export function CopyablePackages({ items }: { items: readonly string[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Don't fire setState after unmount if a copy was the last thing that happened.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy(name: string) {
    try {
      // Throws (TypeError) in insecure contexts where clipboard is undefined —
      // caught below, so we never show a false "Copied".
      await navigator.clipboard.writeText(name);
    } catch {
      return;
    }
    setCopied(name);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), RESET_MS);
  }

  return (
    <div className="m-0 flex flex-col items-start font-mono text-[0.8125rem]">
      {items.map((name) => {
        const isCopied = copied === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => copy(name)}
            aria-label={isCopied ? `Copied ${name}` : `Copy ${name}`}
            className="group flex h-6 cursor-pointer items-center gap-1.5 rounded-[3px] text-left transition-transform duration-150 ease-out active:scale-[0.98]"
          >
            <span style={NAME_WEIGHT_STYLE}>{name}</span>
            <CopyGlyph copied={isCopied} />
          </button>
        );
      })}

      {/* One shared polite announcement so screen readers hear the copy. */}
      <span aria-live="polite" className="sr-only">
        {copied ? `Copied ${copied} to clipboard` : ""}
      </span>
    </div>
  );
}

// Trailing glyph: copy and check stacked, cross-faded on the copied state.
// 14px to sit with the 13px name; strokeWidth 1.8 keeps the lines legible that
// small. currentColor + opacity so it inherits the brown and the row's hover.
function CopyGlyph({ copied }: { copied: boolean }) {
  return (
    <span
      className="relative inline-flex size-3.5 flex-none items-center justify-center"
      aria-hidden
    >
      <span
        className={`absolute inset-0 inline-flex items-center justify-center transition-opacity duration-150 ease-out ${
          copied
            ? "opacity-0"
            : "opacity-35 group-hover:opacity-70 group-focus-visible:opacity-70"
        }`}
      >
        <CopyIcon />
      </span>
      <span
        className={`absolute inset-0 inline-flex items-center justify-center transition-opacity duration-150 ease-out ${
          copied ? "opacity-100" : "opacity-0"
        }`}
      >
        <CheckIcon />
      </span>
    </span>
  );
}

function CopyIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15.5 V6 A2.5 2.5 0 0 1 7.5 3.5 H15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5 L10 17.5 L19 7" />
    </svg>
  );
}
