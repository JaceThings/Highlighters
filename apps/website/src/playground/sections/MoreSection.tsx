import { Section } from "../../components/playground/Section.tsx";

const DOCS_URL = "https://github.com/JaceThings/Highlighters/wiki/Options-Reference";

// leading-none so the smaller mono font doesn't inflate the paragraph's 24px line boxes (see the
// section-title span in OptionDemo.tsx for the same mixed-font metrics fix).
const Mono = ({ children }: { children: string }) => (
  <span className="font-mono text-[13px] leading-none text-text-primary">{children}</span>
);

export function MoreSection() {
  return (
    <Section
      title="More settings"
      description="The sliders above cover the essentials. There's plenty more in the box."
    >
      <div className="flex w-full flex-col px-[4px]">
        <p className="text-[14px] leading-[24px] font-medium tracking-[-0.25px] text-wrap-pretty text-text-secondary">
          Dig a little deeper and you'll find <Mono>gradient</Mono> colour ramps, an
          additive <Mono>glow</Mono>, the whole <Mono>animation</Mono> group,{" "}
          <Mono>speed</Mono>-reactive ink, semantic <Mono>{"<mark>"}</Mono> output,
          swappable <Mono>renderer</Mono> tiers, and smaller touches like{" "}
          <Mono>seed</Mono>, <Mono>fadeOnClear</Mono> and{" "}
          <Mono>ink.startEndBuildup</Mono>. None have a knob on this page, but every
          one of them is yours to use.
        </p>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          data-focus-ring
          className="w-fit text-[14px] leading-[24px] font-medium tracking-[-0.25px] text-text-primary underline underline-offset-2 hover:opacity-70"
        >
          See every option in the reference →
        </a>
      </div>
    </Section>
  );
}
