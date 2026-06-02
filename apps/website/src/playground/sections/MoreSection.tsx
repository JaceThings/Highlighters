import { Section } from "../../components/playground/Section.tsx";

// The settings that aren't surfaced as live controls here — the live-selection
// ones (best tried on the home page) and the code-only ones — documented so the
// page still covers the whole API.
const ROWS: { name: string; note: string }[] = [
  { name: "fadeOnClear", note: "Live selection: fades out on deselect instead of vanishing. On by default." },
  { name: "speed", note: "Live selection, Beta (off): a faster swipe lays lighter ink, varying along the line." },
  { name: "gradient", note: "Multi-stop length-wise colour ramp; overrides color when set." },
  { name: "semantic", note: "Also wraps targets in a real <mark> element (reversible). Off by default." },
  { name: "seed", note: "Deterministic randomness seed; derived from the target when unset." },
  { name: "contrastBackground", note: "Background colour for the dev-time WCAG contrast warning. Not rendered." },
  { name: "tip.width / tip.thickness", note: "Nib dimensions — reserved API; the default slant geometry uses angle + band width." },
];

export function MoreSection() {
  return (
    <Section
      title="More settings"
      description="The rest of the API, not wired to controls here. The live-selection ones are best tried by selecting text on the home page; the others are set in code."
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
      </div>
    </Section>
  );
}
