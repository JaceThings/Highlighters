import { useEffect, useId, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { armDemoPaperSelectionBlock } from "./demoPaperSelection.ts";
import paperBg from "./paperBg.ts";
import { IS_WEBKIT } from "./is-webkit.ts";

const SHEET_SIZE = { width: "110%", height: "calc(100% * 313 / 288)" } as const;

// The paper sheet. Authored at 561x313: a 510x288 sheet with ~25px shadow bleed below. Sized 110%
// wide and 313/288 of the card height so the sheet region covers the card at any aspect (bleed hangs below).
//
// Engine split: a live SVG (paths + filters) on Blink/Gecko, which rasterise once and hold 60fps;
// WebKit can't cache the filter chain across scroll, so it gets a pixel-identical raster
// (/paper-sheet.webp) it GPU-composites instead. See paperBg.ts to regenerate it.

export function PaperCard({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  // Namespace the SVG's filter/gradient ids per instance, else every card resolves to the first's defs.
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svg = useMemo(() => (IS_WEBKIT ? "" : paperBg.replace(/2069_66/g, uid)), [uid]);

  useEffect(() => {
    const disarm = armDemoPaperSelectionBlock();
    const el = rootRef.current;
    if (!el) return disarm;
    const block = (e: Event) => e.preventDefault();
    el.addEventListener("selectstart", block);
    return () => {
      el.removeEventListener("selectstart", block);
      disarm();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`demo-paper relative isolate flex select-none flex-col ${className ?? ""}`}
      style={{ minHeight: 288, ...style }}
    >
      {IS_WEBKIT ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2 bg-[length:100%_100%] bg-no-repeat"
          // 313/288 height: the 288-tall sheet covers the card; the 25px bleed hangs below.
          style={{ ...SHEET_SIZE, backgroundImage: "url(/paper-sheet.webp)" }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2"
          style={{ ...SHEET_SIZE, maxWidth: "none" }}
          // SVG is our own build artifact (paperBg.ts), not user input.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}
