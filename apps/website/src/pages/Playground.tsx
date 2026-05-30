import { Stagger } from "../components/Stagger.tsx";
import { PlaygroundOptionsProvider } from "../playground/options-context.tsx";
import { RecommendedLooks } from "../playground/RecommendedLooks.tsx";
import { CopyConfig } from "../playground/CopyConfig.tsx";
import { TipSection } from "../playground/sections/TipSection.tsx";
import { EndsSection } from "../playground/sections/EndsSection.tsx";
import { StackSection } from "../playground/sections/StackSection.tsx";
import { ColorSection } from "../playground/sections/ColorSection.tsx";
import { AdvancedReference } from "../playground/AdvancedReference.tsx";

// The whole playground shares one live options object — a single highlighter the
// user BUILDS via the control sections. Every section reads and writes it through
// the provider; each control section embeds the shared <Preview /> as its first
// child (the SECTIONS_CONTRACT). The Preview is a pre-highlighted EXHIBIT: its
// sample phrases are painted with the live options and re-highlight in real time
// no matter which control you touch — no selection required, and never touchable.
//
// INFORMATION ARCHITECTURE — basics at the TOP, everything else as a doc-style
// reference at the BOTTOM. There is no "selected preset" mode. RecommendedLooks
// leads as clearly-optional starting points (clicking one COPIES its values into
// the controls). Then the BASICS block — the handful of controls that actually
// build a highlighter: the Tip nib, the mark Ends (overshoot), the Stack optic
// (overlaps darken vs. stay flat), and the Colour. Below that, AdvancedReference
// is the detailed document covering every remaining control. CopyConfig closes
// the column with the build emitted as copy-pasteable code.
//
// Indices 0–5 are reserved for the Header; body starts at 6. The 48px gap
// between staggered blocks matches the Figma `--p-12` rhythm used site-wide.
const SECTIONS = [
  RecommendedLooks,
  // --- BASICS: build what you need, in order ---
  TipSection,
  EndsSection,
  StackSection,
  ColorSection,
  // --- ADVANCED: the detailed reference document ---
  AdvancedReference,
  CopyConfig,
] as const;

export function Playground() {
  return (
    <PlaygroundOptionsProvider>
      <div className="flex w-full flex-col" style={{ gap: 48 }}>
        {SECTIONS.map((SectionComponent, i) => (
          <Stagger key={SectionComponent.name} index={6 + i}>
            <SectionComponent />
          </Stagger>
        ))}
      </div>
    </PlaygroundOptionsProvider>
  );
}
