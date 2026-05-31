import { DOCK_H } from "./constants.ts";

// The dock's white capsule. The shape is a "squircle capsule": the left/right
// caps are a specific rounded profile (wider than a pure semicircle), and the
// span between them is a plain rectangle. So to fit any width we keep the caps
// fixed and stretch ONLY the middle — a horizontal 9-slice.
//
// `CAP_PATH` is the left cap lifted verbatim from the source CapsuleBg.svg
// (its first sub-path, 0‑110.827 on a 145-tall canvas). The right cap is the
// same path mirrored. Each cap keeps its aspect ratio (so the profile never
// squishes); the middle is a flex-1 white rectangle that takes up the slack.
//
// The float shadow is a `drop-shadow` filter on the whole silhouette rather than
// a `box-shadow` on a pill: drop-shadow reads the real alpha edge, so the halo
// hugs the squircle caps instead of a too-tight semicircle.

const CAP_PATH =
  "M47.7024 140.628C60.3281 145 79.2648 145 110.827 145V0C79.2648 0 60.3281 0 47.7024 4.37175C27.5659 11.7015 11.7013 27.5663 4.37168 47.7032C1.47898 55.651 0 64.0429 0 72.5C0 80.9571 1.47898 89.349 4.37168 97.2968C11.7013 117.434 27.5659 133.298 47.7024 140.628Z";

// Native size of the cap on the source canvas — its height is the dock height
// (the path was authored on a DOCK_H-tall canvas), so it tracks the shared
// constant; the width is the cap's own coordinate span.
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
        // Lock the box to the cap's aspect so width tracks the dock height — the
        // profile scales but never distorts.
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
        // Full-pill radius so the box-shadow hugs the capsule. box-shadow (unlike
        // drop-shadow) supports the Figma -7px spread, which pulls the shadow tight
        // to the bottom edge. The pill ≈ the squircle for a soft blurred shadow.
        borderRadius: "9999px",
        boxShadow: "0 6px 14px -7px color(display-p3 0.451 0.3412 0.2902 / 0.30)",
      }}
    >
      <Cap />
      {/* -1px each side overlaps the straight inner edge of each cap so the
          white never shows a hairline seam (white-on-white, invisible). */}
      <div style={{ flex: "1 1 auto", background: "#fff", marginInline: "-1px" }} />
      <Cap flip />
    </div>
  );
}
