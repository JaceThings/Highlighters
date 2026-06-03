import { useState } from "react";
import { InstallCommands } from "../components/InstallCommands.tsx";
import { Stagger } from "../components/Stagger.tsx";
import { useDockEntrance } from "../dock-entrance.tsx";
import { creditLine, pickNextExcerpt } from "./excerpts.ts";

// The homepage IS the demo: ruled paper with real text and a pen tray below —
// select any line to paint it live (SelectionMarker). Top to bottom: wordmark,
// intro, features, npm install commands, divider, then a public-domain passage
// from a no-repeat shuffle bag per load (excerpts.ts).
//
// Type locks to the 24px ruled rhythm (Figma 2017:781): line-height and block gap
// are each one row, sizes rem-based. The wordmark uses the 550 heading weight;
// everything else (weight, colour, the cv05 tailed l) inherits from <body>.

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

      {/* The npm install commands, one per line — plain body text on the 24px
          grid (four lines = four rows). See InstallCommands. */}
      <Stagger index={3}>
        <InstallCommands items={PACKAGES} />
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
