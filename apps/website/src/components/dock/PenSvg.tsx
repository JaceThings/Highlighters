import { useId, type CSSProperties } from "react";
import { lightenOklch, oklchToCss, parseOklch } from "./oklch.ts";

// The three nib shapes. Each path is in its own 0–15 space (as exported), so we
// place it with a transform: TX centres the 14.26-wide nib on the barrel, and a
// per-tip `ty` drops its bottom onto the funnel top (~y16 in marker space) —
// the shapes differ in height, hence the different offsets. Painted (with the
// band) in the ink `color`.
const TX = 13.943;
const TIPS = {
  slant: {
    d: "M0 8.90395V8.90755V14.6331H14.2627L14.2627 2.31478C14.2627 1.28051 14.2625 0.762792 14.0449 0.454428C13.9929 0.380825 13.944 0.325003 13.8662 0.255209C13.1837 -0.357086 12.1504 0.280438 11.4834 0.627279L2.04883 5.53353L2.04642 5.53478C1.30365 5.92102 0.931451 6.11457 0.660156 6.39779C0.420078 6.6485 0.2376 6.94898 0.125977 7.27767C0 7.64881 0 8.06767 0 8.90395Z",
    ty: 1.37,
  },
  round: {
    d: "M0 7.34442V7.35451V15.6738H14.2627V7.35451C14.2627 6.30373 14.2619 5.77805 14.1963 5.33791C13.8575 3.06672 12.262 1.22144 10.1338 0.523454C8.00559 -0.17453 6.2573 -0.17444 4.12891 0.523454C2.00052 1.22135 0.404217 3.06658 0.0654296 5.33791C0 5.77663 0 6.30042 0 7.34442Z",
    ty: 0.33,
  },
  flat: {
    d: "M0.327148 2.21365C0.000249654 2.85536 0 3.69574 0 5.37576V16.0261H14.2627V5.37576C14.2627 3.69588 14.2624 2.85534 13.9355 2.21365C13.6479 1.64916 13.1885 1.18974 12.624 0.902125C10.262 -0.300971 3.99787 -0.300446 1.6377 0.902125C1.0733 1.18975 0.614736 1.64922 0.327148 2.21365Z",
    ty: -0.03,
  },
} as const;

// The coloured ink band near the funnel. Rendered standalone (outside the
// barrel's drop-shadow) so the band + tip are the only coloured layer — which
// lets MarkerRow crossfade just the COLOUR over a static barrel + shadow.
const BAND = "M8 57.0525H34.1475V67.7492H8V57.0525Z";

interface PenProps {
  tip: "slant" | "flat" | "round";
  /** Animated ink colour, passed as an oklch() string. */
  color: string;
  /** Rendered width in px; height follows the 43x170 aspect. */
  width: number;
  className?: string;
  style?: CSSProperties;
  /** Render only the coloured layer (band + tip), skipping the grey barrel and
   *  its drop-shadow — used for the dissolving crossfade overlay. */
  colorOnly?: boolean;
}

export function Pen({ tip, color, width, className, style, colorOnly }: PenProps) {
  // Namespace every gradient/filter/clipPath id so multiple <Pen> instances on
  // one page never collide on shared defs. useId() yields a stable, unique base.
  const id = useId();
  // `color` arrives as an oklch() string (the animated ink). Read it back so we
  // derive the tip shading in OKLCH each frame.
  const ink = parseOklch(color);
  // The lighter top of the tip gradient — also the colour of the top rim, so the
  // rim blends into the nib instead of reading as a dark line.
  const tipTop = oklchToCss(lightenOklch(ink, 0.06));
  // White specular highlight opacity, scaled off OKLCH lightness: dark inks
  // (brown ~0.5) stay ~0.07, light inks (yellow/green) brighten.
  const whiteAlpha = Math.max(0.07, Math.min(0.5, 0.07 + 0.7 * Math.max(0, ink.L - 0.5)));

  return (
    <svg
      width={width}
      viewBox="0 0 43 170"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ width, height: "auto", ...style }}
    >
      {/* Grey barrel + funnel and its drop-shadow. Skipped in colorOnly mode so
          the dissolving overlay carries only the ink (no doubled shadow). */}
      {!colorOnly && (
        <g filter={`url(#${id}-filter0)`}>
          <g clipPath={`url(#${id}-clip0)`}>
            <path
              d="M8 45.3892V57.0525H34.1475V45.3892C34.1475 42.9072 33.4998 40.4681 32.2684 38.3131L31.2726 36.5705C30.0412 34.4155 29.3934 31.9764 29.3934 29.4944V15.4541H12.7541V29.4944C12.7541 31.9764 12.1064 34.4155 10.8749 36.5705L9.87916 38.3131C8.64773 40.4681 8 42.9072 8 45.3892Z"
              fill={`url(#${id}-paint0)`}
            />
            <path
              d="M8 57.0525H34.1475V158.652H8V57.0525Z"
              fill={`url(#${id}-paint1)`}
            />
          </g>
        </g>
      )}
      {/* Coloured ink band — standalone (no drop-shadow) so it crossfades cleanly
          over a static barrel; the grey body behind it carries the real shadow. */}
      <path d={BAND} style={{ fill: color }} />
      <path
        d={BAND}
        fill={`url(#${id}-paint2)`}
        style={{ mixBlendMode: "color-dodge" }}
      />
      <g filter={`url(#${id}-filter1)`}>
        {/* New nib shape, centred on the barrel and dropped onto the funnel.
            Vertical gradient matching the ink: lighter at the nib, base toward
            the body (replaces the original brown paint3, now colour-relative). */}
        <g transform={`translate(${TX} ${TIPS[tip].ty})`}>
          <path d={TIPS[tip].d} fill={`url(#${id}-tipgrad)`} />
        </g>
      </g>
      <defs>
        <filter
          id={`${id}-filter0`}
          x="-0.262451"
          y="10.1509"
          width="43"
          height="160"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="2" />
          <feGaussianBlur stdDeviation="2.5" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.45098 0 0 0 0 0.341176 0 0 0 0 0.290196 0 0 0 0.06 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result={`${id}-effect1_dropShadow`} />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="3" />
          <feGaussianBlur stdDeviation="4" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.45098 0 0 0 0 0.341176 0 0 0 0 0.290196 0 0 0 0.12 0" />
          <feBlend mode="normal" in2={`${id}-effect1_dropShadow`} result={`${id}-effect2_dropShadow`} />
          <feBlend mode="normal" in="SourceGraphic" in2={`${id}-effect2_dropShadow`} result="shape" />
        </filter>
        <filter
          id={`${id}-filter1`}
          x="13"
          y="-1"
          width="16"
          height="18"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          {/* White specular highlight at the nib's top inner edge; opacity scales
              with ink luminance so it stays visible on light inks. */}
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="2.5" />
          <feGaussianBlur stdDeviation="0.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" result={`${id}-hlAlpha`} />
          <feFlood floodColor="#ffffff" floodOpacity={whiteAlpha} />
          <feComposite in2={`${id}-hlAlpha`} operator="in" />
          <feBlend mode="normal" in2="shape" result={`${id}-effect1_innerShadow`} />
          {/* Top rim, tinted to the lighter top-gradient colour so it blends into
              the nib (was a hardcoded dark line). */}
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="1" />
          <feGaussianBlur stdDeviation="0.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" result={`${id}-rimAlpha`} />
          <feFlood floodColor={tipTop} floodOpacity="1" />
          <feComposite in2={`${id}-rimAlpha`} operator="in" />
          <feBlend mode="normal" in2={`${id}-effect1_innerShadow`} result={`${id}-effect2_innerShadow`} />
        </filter>
        <linearGradient
          id={`${id}-paint0`}
          x1="8"
          y1="37.1987"
          x2="34.1475"
          y2="37.1987"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DBDBDB" />
          <stop offset="0.0637281" stopColor="#EBEBEB" />
          <stop offset="0.178482" stopColor="#DADADA" />
          <stop offset="0.48833" stopColor="#F6F6F6" />
          <stop offset="0.757139" stopColor="#EFEFEF" />
          <stop offset="1" stopColor="#DDDDDD" />
        </linearGradient>
        <linearGradient
          id={`${id}-paint1`}
          x1="8"
          y1="110.162"
          x2="34.1475"
          y2="110.162"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DBDBDB" />
          <stop offset="0.0637281" stopColor="#EBEBEB" />
          <stop offset="0.178482" stopColor="#DADADA" />
          <stop offset="0.48833" stopColor="#F6F6F6" />
          <stop offset="0.757139" stopColor="#EFEFEF" />
          <stop offset="1" stopColor="#DDDDDD" />
        </linearGradient>
        <linearGradient
          id={`${id}-paint2`}
          x1="8"
          y1="62.9951"
          x2="34.1475"
          y2="62.9951"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1D1D1D" stopOpacity="0" />
          <stop offset="0.497299" stopColor="#4F4F4F" />
          <stop offset="1" stopColor="#313131" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip0`}>
          <rect
            width="144"
            height="27"
            fill="white"
            transform="translate(7.73755 159.151) rotate(-90)"
          />
        </clipPath>
        <linearGradient
          id={`${id}-tipgrad`}
          x1="21"
          y1="0"
          x2="21"
          y2="16"
          gradientUnits="userSpaceOnUse"
        >
          {/* The JS tween drives these colours each frame, so no CSS transition
              (it would fight the per-frame updates). */}
          <stop style={{ stopColor: tipTop }} />
          <stop offset="1" style={{ stopColor: color }} />
        </linearGradient>
      </defs>
    </svg>
  );
}
