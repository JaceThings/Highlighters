import { useId, useMemo, type CSSProperties, type ReactNode } from "react";
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
  // Namespace the SVG's filter/gradient ids per instance — otherwise multiple cards on one
  // page share ids and every card's filters resolve to the first card's defs.
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
