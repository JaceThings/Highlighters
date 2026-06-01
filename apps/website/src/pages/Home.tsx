import { useState } from "react";
import { pickNextExcerpt } from "./excerpts.ts";

// The homepage IS the demonstration: a sheet of ruled paper with real text and a
// pen tray floating below, so marking it up is the obvious thing to do —
// selecting any text paints it live (SelectionMarker).
//
// Top to bottom: the wordmark, what the library is, what it does, the npm
// packages (one per line), a divider, then a long public-domain passage drawn
// from a shuffle bag per load (excerpts.ts) so there's always fresh prose to
// highlight and the same passage never lands twice in a row.
//
// Type is locked to the paper's 1.5rem (24px) rhythm (Figma 2017:781): line-height
// and inter-block gap are each one ruled row, the column starts on a row boundary
// (Layout's 4.5rem top padding), sizes are rem-based — so every line sits within
// two rules. Weight, letter-spacing, colour and cv05 inherit from <body>.

const INTRO =
  "highlighters draws marker strokes over web text. Not a coloured box sitting behind the words, an actual stroke off a nib: ink that pools where a line starts and stops, streaks left behind as it dries, a little bleed past the last letter. There are three nibs, the kind you'd find in a desk drawer. A broad chisel, a rounded bullet, a fine point.";

const FEATURES =
  "It never touches your text. The marks are painted on top, so the words stay selectable and searchable, and a mark you put down holds its place through scrolling, a resize, a reload. Lay one over another and the overlap darkens the way two real passes would. Some colours glow, fluorescent. The library itself is small and runs anywhere, with bindings for React, Vue and Svelte when you want them.";

const PACKAGES = [
  "@highlighters/core",
  "@highlighters/react",
  "@highlighters/vue",
  "@highlighters/svelte",
];

export function Home() {
  // Drawn once per mount from the shuffle bag, so each load advances through
  // every passage before any repeats (see pickNextExcerpt).
  const [excerpt] = useState(pickNextExcerpt);

  return (
    <div className="flex flex-col gap-6 leading-6">
      <h1 className="m-0 text-[1rem] font-medium">highlighters</h1>

      <p className="m-0">{INTRO}</p>
      <p className="m-0">{FEATURES}</p>

      {/* The npm packages, one per line. Monospace so they read as code; still on
          the 24px grid (four lines = four rows). */}
      <div className="m-0 font-mono text-[0.8125rem]">
        {PACKAGES.map((name) => (
          <div key={name}>{name}</div>
        ))}
      </div>

      {/* Divider: a hairline centred in one ruled row, so the grid is untouched.
          select-none keeps this decorative rule out of any text selection. */}
      <div className="flex h-6 select-none items-center" aria-hidden="true">
        <span
          className="block h-px w-full"
          style={{ background: "rgba(var(--primary-rgb), 0.16)" }}
        />
      </div>

      {/* The randomised classic passage, with a quiet attribution. */}
      <figure className="m-0 flex flex-col gap-6">
        {excerpt.text.split("\n\n").map((para, i) => (
          <p key={i} className="m-0">
            {para}
          </p>
        ))}
        <figcaption className="m-0" style={{ color: "var(--color-text-secondary)" }}>
          from {excerpt.title} by {excerpt.author}
        </figcaption>
      </figure>
    </div>
  );
}
