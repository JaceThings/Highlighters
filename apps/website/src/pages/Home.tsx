import { useMemo, type ReactNode } from "react";
import { getPreset } from "@highlighters/core";
import type { HighlightOptions } from "@highlighters/core";
import { Highlight } from "@highlighters/react";
import { FigureCard } from "../components/playground/FigureCard.tsx";
import { GridBackground } from "../components/GridBackground.tsx";
import { Install } from "../components/Install.tsx";
import { Stagger, useEntranceComplete } from "../components/Stagger.tsx";
import { useFontsReady } from "../hooks/useFontsReady.ts";

// Indices 0–5 are the Header; body starts at 6.
const INTRO_INDEX = 6;
const HERO_INDEX = 7;
const INSTALL_FIRST = 8;

// The hero is a static museum EXHIBIT: the prose is pre-highlighted with a
// fixed, tasteful set of looks that showcase the library (a classic-yellow
// highlight, a wet highlight, an underline, a strike-through). The exhibit is
// non-selectable and its mark overlay is scoped to a position:relative
// container, so it can never paint over the still-invisible text that fades in
// via <Stagger>.
const HERO_HEIGHT = 300;

function Intro() {
  return (
    <section className="w-full pb-6 text-text-primary">
      <Stagger index={INTRO_INDEX}>
        {/* A plain brown PANEL — the museum label, normally selectable, never
            highlighted. */}
        <p className="text-[14px] leading-[1.4] font-medium tracking-[-0.25px] text-justify hyphens-auto">
          highlighters draws realistic highlighter-pen marks over your text —
          chisel-tip ink that pools at the ends, feathers into the paper, and
          darkens where it overlaps. Works with React, Vue, Svelte, or plain
          JavaScript.
        </p>
      </Stagger>
    </section>
  );
}

function Hero() {
  // A fixed showcase of looks for the hero exhibit. Preset-derived where it
  // helps, with distinct stable seeds so each run has its own ink texture.
  const yellow = useMemo<HighlightOptions>(
    () => ({ ...getPreset("classic-yellow"), seed: 11 }),
    [],
  );
  const wet = useMemo<HighlightOptions>(
    () => ({ ...getPreset("wet"), color: "pink", seed: 22 }),
    [],
  );
  const underline = useMemo<HighlightOptions>(
    () => ({ markType: "underline", color: "#73574a", seed: 33 }),
    [],
  );
  const strike = useMemo<HighlightOptions>(
    () => ({ markType: "strike-through", color: "#73574a", seed: 44 }),
    [],
  );

  // Gate the marks on BOTH the Stagger entrance and web-font load. Entrance: the
  // Hero is inside <Stagger index={HERO_INDEX}>, so before the text has faded in
  // we render the phrases plain. Fonts: a mark measures the heading's line box, so
  // it must wait for the real font — otherwise it captures the fallback-font
  // metrics and then resizes mid-entrance when the font swaps in. Identical text
  // in both states + overlay marks => zero layout shift either way.
  const entered = useEntranceComplete();
  const fontsReady = useFontsReady();
  const ready = entered && fontsReady;
  const mark = (children: ReactNode, options: HighlightOptions) =>
    ready ? (
      <Highlight as="span" options={options}>
        {children}
      </Highlight>
    ) : (
      <span>{children}</span>
    );

  return (
    <FigureCard>
      <div
        className="relative flex w-full items-center justify-center overflow-hidden px-8 py-7"
        style={{ height: HERO_HEIGHT }}
      >
        <GridBackground />
        {/* The exhibit: relative scopes the @highlighters overlay inside this
            block; select-none means the reader can look but never touch. */}
        <div className="relative flex max-w-[420px] select-none flex-col gap-3 text-text-primary">
          <h3 className="text-[20px] leading-[1.3] font-[560] tracking-[-0.4px]">
            {mark("Ink that behaves", yellow)} like a real marker
          </h3>
          <p className="text-[15px] leading-[1.7] font-medium tracking-[-0.2px] text-wrap-pretty">
            Drop a highlight over any run of text and it{" "}
            {mark("pools at the ends, feathers into the paper", wet)}, and stays
            perfectly legible underneath. The same engine draws{" "}
            {mark("underlines", underline)} and {mark("strike-throughs", strike)}
            .
          </p>
        </div>
      </div>
    </FigureCard>
  );
}

export function Home() {
  return (
    <>
      <Intro />
      <Stagger index={HERO_INDEX}>
        <Hero />
      </Stagger>
      <Install staggerFrom={INSTALL_FIRST} />
    </>
  );
}
