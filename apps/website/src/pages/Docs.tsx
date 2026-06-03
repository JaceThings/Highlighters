import { Suspense, lazy } from "react";
import { Stagger } from "../components/Stagger.tsx";

// The heavy playground engine (@highlighters/react + @lisse) is lazy-loaded so it
// stays out of the home bundle; Docs itself is imported eagerly by PageFade.
const DocsPlayground = lazy(() =>
  import("../playground/DocsPlayground.tsx").then((m) => ({ default: m.DocsPlayground })),
);

export function Docs() {
  return (
    <div className="flex w-full flex-col" style={{ gap: 48 }}>
      <Stagger index={0}>
        <header className="flex flex-col gap-2 leading-6">
          <h1 className="m-0 text-[1rem] font-[550]">Docs</h1>
          <p className="m-0 text-text-secondary">
            Every setting, live. Pick a starting point, then toggle and drag the
            controls - the sample text re-highlights as you go.
          </p>
        </header>
      </Stagger>
      <Suspense fallback={null}>
        <DocsPlayground />
      </Suspense>
    </div>
  );
}
