import { useMemo } from "react";
import { Stagger } from "../components/Stagger.tsx";
import { RowGrid } from "../components/RowGrid.tsx";
import { PlaygroundOptionsProvider } from "./options-context.tsx";
import { OptionDemo, OPTION_DEMOS } from "./sections/OptionDemo.tsx";
import { MoreSection } from "./sections/MoreSection.tsx";
import { buildCuratedQuotes } from "./quote-marks.ts";

// One live demo per visual option, all writing one shared options object. Lazy-loaded by Docs.
// RowGrid snaps every demo to whole 24px rows, so the column rides the ruled grid no matter how tall
// a card or its quote turns out to be (the .cv-demo's own 24px-multiple sizing just keeps slack ~0).
export function DocsPlayground() {
  const quotes = useMemo(() => buildCuratedQuotes(OPTION_DEMOS.map((d) => d.title)), []);

  return (
    <PlaygroundOptionsProvider>
      <RowGrid className="w-full">
        {OPTION_DEMOS.map((demo, i) => (
          <Stagger key={demo.title} index={1 + i}>
            <OptionDemo demo={demo} quote={quotes[i]} />
          </Stagger>
        ))}
        <Stagger index={1 + OPTION_DEMOS.length}>
          <MoreSection />
        </Stagger>
      </RowGrid>
    </PlaygroundOptionsProvider>
  );
}
