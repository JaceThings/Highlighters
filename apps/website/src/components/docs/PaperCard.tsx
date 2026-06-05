import { useId, useMemo, type CSSProperties, type ReactNode } from "react";
import paperBg from "./paperBg.ts";
import { IS_WEBKIT } from "./is-webkit.ts";

// The paper sheet. Authored at 561×313 with shadow bleed around a 510×288 sheet, so the artwork
// is sized to 110% and centred to line the sheet up with the content box.
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
          style={{ width: "110%", aspectRatio: "561 / 313", backgroundImage: "url(/paper-sheet.webp)" }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2"
          style={{ width: "110%", maxWidth: "none" }}
          // The SVG markup is our own build artifact (paperBg.ts), not user input.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}
