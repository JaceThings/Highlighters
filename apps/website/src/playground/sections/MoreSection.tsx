import { Section } from "../../components/playground/Section.tsx";

const DOCS_URL = "https://github.com/JaceThings/Highlighters/wiki/Options-Reference";

// API names, set apart from the muted body by the darker primary ink (no monospace, no bold).
const Term = ({ children }: { children: string }) => (
  <span className="text-text-primary">{children}</span>
);

export function MoreSection() {
  return (
    <Section
      title="More settings"
      description="The sliders above cover the essentials. There's plenty more in the box."
    >
      <div className="flex w-full flex-col px-[4px]">
        <p className="text-[14px] leading-[24px] font-medium tracking-[-0.25px] text-wrap-pretty text-text-secondary">
          Dig a little deeper and you'll find <Term>gradient</Term> colour ramps, an
          additive <Term>glow</Term>, the whole <Term>animation</Term> group,{" "}
          <Term>speed</Term>-reactive ink, semantic <Term>{"<mark>"}</Term> output,
          swappable <Term>renderer</Term> tiers, and smaller touches like{" "}
          <Term>seed</Term>, <Term>fadeOnClear</Term> and{" "}
          <Term>ink.startEndBuildup</Term>. None have a knob on this page, but every
          one of them is yours to use.
        </p>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          data-focus-ring
          className="w-fit text-[14px] leading-[24px] font-medium tracking-[-0.25px] text-text-primary underline underline-offset-2 hover:opacity-70"
        >
          See every option in the reference
          {/* SVG arrow: the Inter subset has no U+2192, a text arrow would render in the fallback font. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="ml-[5px] inline-block size-[12px] align-[-1.5px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.75 6h8.5M7 2.75 10.25 6 7 9.25" />
          </svg>
        </a>
      </div>
    </Section>
  );
}
