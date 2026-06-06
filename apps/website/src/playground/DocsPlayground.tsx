import { useMemo } from "react";
import { Stagger } from "../components/Stagger.tsx";
import { PlaygroundOptionsProvider } from "./options-context.tsx";
import { OptionDemo, OPTION_DEMOS } from "./sections/OptionDemo.tsx";
import { MoreSection } from "./sections/MoreSection.tsx";
import { buildCuratedQuotes } from "./quote-marks.ts";

// One live demo per visual option, all writing one shared options object. Lazy-loaded by Docs.
export function DocsPlayground() {
  const quotes = useMemo(() => buildCuratedQuotes(OPTION_DEMOS.map((d) => d.title)), []);

  return (
    <PlaygroundOptionsProvider>
      {/* No gap: each .cv-demo is already a whole number of 24px rows (incl. its 48px bottom pad), so
          the column flows as a continuous 24px grid. */}
      <div className="flex w-full flex-col">
        {OPTION_DEMOS.map((demo, i) => (
          <Stagger key={demo.title} index={1 + i}>
            <OptionDemo demo={demo} quote={quotes[i]} />
          </Stagger>
        ))}
        <Stagger index={1 + OPTION_DEMOS.length}>
          <MoreSection />
        </Stagger>
      </div>
    </PlaygroundOptionsProvider>
  );
}
