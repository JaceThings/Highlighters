import { DOCK_H } from "./constants.ts";

// The dock's white "squircle capsule": fixed rounded caps with a stretchable white
// rectangle between them (a horizontal 9-slice). CAP_PATH is the left cap from the
// source SVG; the right is the same path mirrored.

const CAP_PATH =
  "M47.7024 140.628C60.3281 145 79.2648 145 110.827 145V0C79.2648 0 60.3281 0 47.7024 4.37175C27.5659 11.7015 11.7013 27.5663 4.37168 47.7032C1.47898 55.651 0 64.0429 0 72.5C0 80.9571 1.47898 89.349 4.37168 97.2968C11.7013 117.434 27.5659 133.298 47.7024 140.628Z";

// Cap size on the source canvas — height tracks DOCK_H, width is its coordinate span.
const CAP_W = 110.827;
const CAP_H = DOCK_H;

function Cap({ flip }: { flip?: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${CAP_W} ${CAP_H}`}
      aria-hidden
      style={{
        display: "block",
        height: "100%",
        width: "auto",
        // Lock the aspect so the cap scales without distorting.
        aspectRatio: `${CAP_W} / ${CAP_H}`,
        flex: "none",
        transform: flip ? "scaleX(-1)" : undefined,
      }}
    >
      <path d={CAP_PATH} fill="#fff" />
    </svg>
  );
}

/** Absolutely-positioned white capsule that fills its parent (the dock sets the
 *  height; this stretches to whatever width the content needs). */
export function CapsuleBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "stretch",
        // Full-pill radius so the box-shadow (which supports the -7px spread) hugs
        // the capsule; the pill ≈ the squircle for a soft shadow.
        borderRadius: "9999px",
        boxShadow: "0 6px 14px -7px color(display-p3 0.451 0.3412 0.2902 / 0.30)",
      }}
    >
      <Cap />
      {/* -1px overlap hides the seam where each cap meets the middle. */}
      <div style={{ flex: "1 1 auto", background: "#fff", marginInline: "-1px" }} />
      <Cap flip />
    </div>
  );
}
