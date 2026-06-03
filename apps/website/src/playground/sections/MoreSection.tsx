import { Section } from "../../components/playground/Section.tsx";

const DOCS_URL = "https://github.com/JaceThings/Highlighters#readme";

const Mono = ({ children }: { children: string }) => (
  <span className="font-mono text-[13px] text-text-primary">{children}</span>
);

export function MoreSection() {
  return (
    <Section
      title="More settings"
      description="The rest of the API, not wired to live controls here."
    >
      <div className="flex w-full flex-col gap-3 px-[4px]">
        <p className="text-[14px] leading-[1.6] font-medium tracking-[-0.25px] text-wrap-pretty text-text-secondary">
          Beyond the controls above, the library has more: <Mono>gradient</Mono>{" "}
          colour ramps, additive <Mono>glow</Mono>, the full <Mono>animation</Mono>{" "}
          group, <Mono>speed</Mono>-reactive ink, semantic <Mono>{"<mark>"}</Mono>{" "}
          output, <Mono>renderer</Mono> tiers, and a handful more like{" "}
          <Mono>seed</Mono>, <Mono>fadeOnClear</Mono> and{" "}
          <Mono>ink.startEndBuildup</Mono>. None of them are wired to live controls
          here, but they all ship in the box.
        </p>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          data-focus-ring
          className="mt-1 w-fit text-[14px] font-medium tracking-[-0.25px] text-text-primary underline underline-offset-2 hover:opacity-70"
        >
          See them all in the full reference →
        </a>
      </div>
    </Section>
  );
}
