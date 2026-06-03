import { useId, useMemo, type CSSProperties, type ReactNode } from "react";
import paperBg from "./paperBg.ts";

// The paper sheet, rendered as a REAL inline SVG (not an <img>) so its paths/filters live in
// the page DOM. The grain stays external (/paper-grain.jpg) — an inline SVG can load an
// external <image> but an SVG used as <img> can't — keeping this vector ~6.6 KB not ~79 KB.
//
// Authored at 561×313 with shadow bleed around a 510×288 sheet, so the inline SVG is sized
// to 110% and centred to line the sheet up with the content box.

export function PaperCard({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  // Namespace the SVG's filter/gradient ids per instance — otherwise every card's filters
  // resolve to the first card's defs.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svg = useMemo(() => paperBg.replace(/2069_66/g, uid), [uid]);

  return (
    <div
      className={`demo-paper relative isolate flex flex-col ${className ?? ""}`}
      style={{ minHeight: 288, ...style }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2"
        style={{ width: "110%", maxWidth: "none" }}
        // The SVG markup is our own build artifact (paperBg.ts), not user input.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}
