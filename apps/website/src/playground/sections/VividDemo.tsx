import { useState } from "react";
import { Section } from "../../components/playground/Section.tsx";
import { PaperCard } from "../../components/docs/PaperCard.tsx";
import { ScribbleLegend } from "../../components/docs/ScribbleLegend.tsx";
import { Preview } from "../Preview.tsx";
import { StaticQuote } from "../quote-render.tsx";
import { QUOTES } from "../quotes.ts";
import { useSeen } from "../../hooks/useSeen.ts";

// The `vivid` demo, on a dark `invert` card so multiply's dark-theme failure (and the fixes) show.
// `vivid` is local to this card, not the shared options - else it would re-route every other card too.

// Warm off-white ink so the quote reads on the dark inverted paper.
const DARK_PAPER_INK = "#e9e3d8";
type VividMode = "off" | "on" | "screen";
const VIVID_OPTS = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
  { value: "screen", label: "Screen" }
] as const;
// A real quote with a clean central band (strategy "central" marks one phrase, no overlap doubles).
const QUOTE = QUOTES[10]; // "If you judge a fish by its ability to climb a tree..."

export function VividDemo() {
  const { ref, seen } = useSeen();
  // Default to `screen` - the variant that keeps light text crisp on the dark surface.
  const [mode, setMode] = useState<VividMode>("screen");
  // Map the control onto the core option: off is false, on is true (vivid: true), screen is "screen".
  const vivid: boolean | "screen" =
    mode === "off" ? false : mode === "screen" ? "screen" : true;

  return (
    <div ref={ref} className="cv-demo">
      <Section
        title={
          <>
            Vivid{" "}
            <span className="text-[0.8em] leading-none font-normal text-text-secondary">
              (vivid)
            </span>
          </>
        }
        description="Multiply is tuned for light paper, so on a dark surface the ink sinks toward black (Off). On floats the ink onto its own layer as a flat translucent band, visible, but it veils the text. Screen mirrors multiply for dark surfaces: a bright band that keeps the light text crisp."
      >
        <PaperCard invert>
          {!seen ? (
            <StaticQuote quote={QUOTE} textColor={DARK_PAPER_INK} />
          ) : (
            <Preview
              quote={QUOTE}
              strategy="central"
              vivid={vivid}
              textColor={DARK_PAPER_INK}
            />
          )}
          <ScribbleLegend
            ariaLabel="Vivid"
            options={VIVID_OPTS}
            value={mode}
            onChange={(v) => setMode(v as VividMode)}
            ink={DARK_PAPER_INK}
          />
        </PaperCard>
      </Section>
    </div>
  );
}
