import { useState } from "react";
import { CopyablePackages } from "../components/CopyablePackages.tsx";
import { Stagger } from "../components/Stagger.tsx";
import { useDockEntrance } from "../dock-entrance.tsx";
import { creditLine, pickNextExcerpt } from "./excerpts.ts";

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
// two rules. The wordmark steps up to the 550 heading weight used across the
// site; body weight, letter-spacing, colour and the ss02 stylistic set (the
// tailed lowercase l) inherit from <body>.

const INTRO =
  "This library allows you to draw marker strokes over web text. Not a coloured box sitting behind the words, an actual stroke off a nib: ink that pools where a line starts and stops, streaks left behind as it dries, a little bleed past the last letter. There are three nibs, the kind you'd find in a desk drawer. A broad chisel, a rounded bullet, a fine point.";

const FEATURES =
  "It never touches your text. The marks are painted on top, so the words stay selectable and searchable, and a mark you put down holds its place through scrolling and a resize. Lay one over another and the overlap darkens the way two real passes would. Some colours glow, fluorescent. The library itself is small and runs anywhere, with bindings for React, Vue and Svelte when you want them.";

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
  // The last block's arrival is the cue for the dock to fly in (dock-entrance.tsx).
  const { signalReady } = useDockEntrance();

  return (
    <div className="flex flex-col gap-6 leading-6">
      {/* Each block fades + focuses in on load, cascaded by index (see Stagger),
          matching the lisse landing page. Wrapping blocks (not lines) keeps the
          24px gap rhythm: the Stagger <div>s are the flex children. */}
      <Stagger index={0}>
        <h1 className="m-0 text-[1rem] font-[550]">Highlighters</h1>
      </Stagger>

      <Stagger index={1}>
        <p className="m-0">{INTRO}</p>
      </Stagger>
      <Stagger index={2}>
        <p className="m-0">{FEATURES}</p>
      </Stagger>

      {/* The npm packages, one per line — monospace, click-to-copy, still on the
          24px grid (four lines = four rows). See CopyablePackages. */}
      <Stagger index={3}>
        <CopyablePackages items={PACKAGES} />
      </Stagger>

      {/* A playful nudge that the passage below is the demo surface. Muted so it
          reads as a quiet aside; still selectable, so you can mark it up too. */}
      <Stagger index={4}>
        <p className="m-0" style={{ color: "var(--color-text-secondary)" }}>
          Below's a passage to take a highlighter to, if you fancy it.
        </p>
      </Stagger>

      {/* Divider: a hairline centred in one ruled row, so the grid is untouched.
          select-none keeps this decorative rule out of any text selection. */}
      <Stagger index={5}>
        <div className="flex h-6 select-none items-center" aria-hidden="true">
          <span
            className="block h-px w-full"
            style={{ background: "rgba(var(--primary-rgb), 0.16)" }}
          />
        </div>
      </Stagger>

      {/* The randomised classic passage, with a quiet attribution. The last block
          in: its arrival cues the dock to fly in (see signalReady). */}
      <Stagger index={6} onComplete={signalReady}>
        <figure className="m-0 flex flex-col gap-6">
          {excerpt.text.split("\n\n").map((para, i) => (
            <p key={i} className="m-0">
              {para}
            </p>
          ))}
          <figcaption className="m-0" style={{ color: "var(--color-text-secondary)" }}>
            – {creditLine(excerpt)}
          </figcaption>
        </figure>
      </Stagger>
    </div>
  );
}
