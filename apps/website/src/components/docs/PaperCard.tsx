import type { CSSProperties, ReactNode } from "react";
import paperBg from "./paperBg.ts";

// The paper sheet. The whole material — deckled edge, lift shadow, inner modelling, the
// fold/crease, and the grain — is the Figma export, rendered as a REAL inline SVG (not an
// <img>), so the paths and filters live in the page DOM (inspectable, themeable). The grain
// is the one heavy part, so it's kept as an external /paper-grain.jpg the inline SVG points
// at (an inline SVG can load an external <image>; an SVG used as <img> can't), keeping this
// vector ~6.6 KB instead of ~79 KB.
//
// The artwork is authored at 561×313 with shadow bleed around a 510×288 sheet, so the
// inline SVG is sized to 110% and centred to line the sheet up with the content box.

export function PaperCard({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative isolate flex flex-col ${className ?? ""}`}
      style={{ minHeight: 288, ...style }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2"
        style={{ width: "110%", maxWidth: "none" }}
        // The SVG markup is our own build artifact (paperBg.svg), not user input.
        dangerouslySetInnerHTML={{ __html: paperBg }}
      />
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}
