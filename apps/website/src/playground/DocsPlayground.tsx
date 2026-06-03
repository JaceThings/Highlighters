import { useMemo } from "react";
import { Stagger } from "../components/Stagger.tsx";
import { PlaygroundOptionsProvider } from "./options-context.tsx";
import { RecommendedLooks } from "./RecommendedLooks.tsx";
import { OptionDemo, OPTION_DEMOS } from "./sections/OptionDemo.tsx";
import { MoreSection } from "./sections/MoreSection.tsx";
import { ScribbleDefs } from "../components/docs/ScribbleFill.tsx";
import { buildQuoteSequence } from "./quotes.ts";

// One live demo PER visual option: each renders the shared Preview (gated to on-screen so
// the page stays smooth) plus that option's single control, all writing one shared options
// object. RecommendedLooks leads as one-shot starting points; MoreSection lists the rest of
// the API and links to the full reference. Lazy-loaded by Docs (pulls @highlighters/react +
// @lisse) to stay out of the home bundle.
export function DocsPlayground() {
  // Assign a quote to each demo's paper card, in page order, once per load — so quotes never
  // repeat and the same author stays ≥3 apart, reshuffling on every reload.
  const quotes = useMemo(() => buildQuoteSequence(OPTION_DEMOS.length), []);

  return (
    <PlaygroundOptionsProvider>
      <ScribbleDefs />
      <div className="flex w-full flex-col" style={{ gap: 48 }}>
        <Stagger index={1}>
          <RecommendedLooks />
        </Stagger>
        {OPTION_DEMOS.map((demo, i) => (
          <Stagger key={demo.title} index={2 + i}>
            <OptionDemo demo={demo} quote={quotes[i]} />
          </Stagger>
        ))}
        <Stagger index={2 + OPTION_DEMOS.length}>
          <MoreSection />
        </Stagger>
      </div>
    </PlaygroundOptionsProvider>
  );
}
