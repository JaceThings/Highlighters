import { Section } from "../../components/playground/Section.tsx";

// Everything not given its own live demo above — documented here so the page still covers
// the whole API. Some are best tried on the home page (live selection); the rest are
// straightforward enough to read about and set in code. Full reference link below.
const ROWS: { name: string; note: string }[] = [
  { name: "ink.startEndBuildup", note: "Ink at the stroke ends. Positive pools (wet look); negative engages the anti-pool guardrail (premium look)." },
  { name: "glow.enabled / intensity / spread", note: "Additive fluorescence over the multiply ink, with its own strength and bloom radius. Off by default." },
  { name: "animation.draw / duration / stagger", note: "The entrance draw-on swipe, how long one band takes, and the delay between consecutive lines." },
  { name: "animation.easing / direction", note: "Easing curve and sweep direction (L→R, R→L, centre-out) for the draw-on." },
  { name: "renderer", note: "Renderer tier — auto picks the best supported and degrades gracefully; or pin svg / css / highlight-api." },
  { name: "fadeOnClear", note: "Live selection: fades out on deselect instead of vanishing. On by default." },
  { name: "speed", note: "Live selection, Beta (off): a faster swipe lays lighter ink, varying along the line." },
  { name: "gradient", note: "Multi-stop length-wise colour ramp; overrides color when set." },
  { name: "semantic", note: "Also wraps targets in a real <mark> element (reversible). Off by default." },
  { name: "seed", note: "Deterministic randomness seed; derived from the target when unset." },
  { name: "contrastBackground", note: "Background colour for the dev-time WCAG contrast warning. Not rendered." },
  { name: "tip.width / tip.thickness", note: "Nib dimensions — reserved API; the default slant geometry uses angle + band width." },
];

const DOCS_URL = "https://github.com/JaceThings/Highlighters#readme";

export function MoreSection() {
  return (
    <Section
      title="More settings"
      description="The rest of the API, not wired to live controls here."
    >
      <div className="flex w-full flex-col gap-3 px-[4px]">
        {ROWS.map((r) => (
          <p
            key={r.name}
            className="text-[14px] leading-[1.4] font-medium tracking-[-0.25px] text-wrap-pretty text-text-secondary"
          >
            <span className="font-mono text-[13px] text-text-primary">{r.name}</span>
            {" — "}
            {r.note}
          </p>
        ))}
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          data-focus-ring
          className="mt-1 w-fit text-[14px] font-medium tracking-[-0.25px] text-text-primary underline underline-offset-2 hover:opacity-70"
        >
          Full options reference on GitHub →
        </a>
      </div>
    </Section>
  );
}
