import { useMemo } from "react";
import { Stagger } from "../components/Stagger.tsx";
import { PlaygroundOptionsProvider } from "./options-context.tsx";
import { OptionDemo, OPTION_DEMOS } from "./sections/OptionDemo.tsx";
import { MoreSection } from "./sections/MoreSection.tsx";
import { buildCuratedQuotes } from "./quote-marks.ts";

// One live demo per visual option, all writing one shared options object.
// Lazy-loaded by Docs (pulls @highlighters/react + @lisse) to stay out of the home bundle.
export function DocsPlayground() {
  const quotes = useMemo(() => buildCuratedQuotes(OPTION_DEMOS.map((d) => d.title)), []);

  return (
    <PlaygroundOptionsProvider>
      {/* gap is small because each .cv-demo pads ~32px below itself (room for the paper shadow
          under content-visibility's paint clip); 12 + 32 keeps the ~48px rhythm. */}
      <div className="flex w-full flex-col" style={{ gap: 12 }}>
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
