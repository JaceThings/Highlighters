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
      {/* Each .cv-demo pads 32px below itself; the 16px gap completes a 48px (2-row) rhythm on the 24px grid. */}
      <div className="flex w-full flex-col" style={{ gap: 16 }}>
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
