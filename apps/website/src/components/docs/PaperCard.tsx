import { useId, useMemo, type CSSProperties, type ReactNode } from "react";
import paperBg from "./paperBg.ts";
import { IS_WEBKIT } from "./is-webkit.ts";

// The paper sheet. Authored at 561×313: a 510×288 sheet at the top with shadow bleed (≈25px) below
// it. Sized 110% wide and 313/288 of the card height, so the sheet region covers the card exactly
// at any aspect (the bleed hangs below) - on mobile the card is narrower-and-taller than the
// artwork, which the old fixed aspect didn't cover.
//
// Engine split: the artwork is a live SVG (paths + filters in the page DOM) on Blink/Gecko,
// which rasterise it once and hold 60fps. WebKit can't cache the filter chain (feTurbulence +
// feDisplacementMap + two big blurs) across scroll - 21 of them dropped /docs to ~8fps - so it
// gets a pre-baked, pixel-identical raster of the same sheet (/paper-sheet.webp) that
// GPU-composites instead. See paperBg.ts to regenerate it.

export function PaperCard({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  // Namespace the SVG's filter/gradient ids per instance - otherwise every card's filters
  // resolve to the first card's defs. (Skipped on WebKit, which uses the raster.)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svg = useMemo(() => (IS_WEBKIT ? "" : paperBg.replace(/2069_66/g, uid)), [uid]);

  return (
    <div
      className={`demo-paper relative isolate flex flex-col ${className ?? ""}`}
      style={{ minHeight: 288, ...style }}
    >
      {IS_WEBKIT ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2 bg-[length:100%_100%] bg-no-repeat"
          // Height is 313/288 of the card so the artwork's 288-tall sheet region covers the card
          // exactly and its bottom shadow bleed (the remaining 25 of 313) hangs below it.
          style={{ width: "110%", height: "calc(100% * 313 / 288)", backgroundImage: "url(/paper-sheet.webp)" }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2"
          style={{ width: "110%", height: "calc(100% * 313 / 288)", maxWidth: "none" }}
          // The SVG markup is our own build artifact (paperBg.ts), not user input.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}
