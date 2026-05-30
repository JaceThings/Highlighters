import { ShapeSection } from "./sections/ShapeSection.tsx";
import { InkSection } from "./sections/InkSection.tsx";
import { EdgeSection } from "./sections/EdgeSection.tsx";
import { PaperSection } from "./sections/PaperSection.tsx";
import { EffectSection } from "./sections/EffectSection.tsx";
import { SnapSection } from "./sections/SnapSection.tsx";
import { AnimationSection } from "./sections/AnimationSection.tsx";
import { RendererSection } from "./sections/RendererSection.tsx";

/**
 * THE ADVANCED REFERENCE — the deep end of the playground.
 *
 * Everything a reader needs to BUILD a highlighter lives up top in the Basics
 * block (tip, ends, stack, colour). This section is the detailed, doc-style
 * reference for the remaining controls: the full ink-physics model, edge detail,
 * paper, material/effect, snapping, animation, and the renderer tiers. It reads
 * like reference material — a clear heading, an intro framing it as the advanced
 * surface, then each control group with an expanded description of exactly what
 * it does and how it interacts with the others.
 *
 * It renders as ONE cohesive document block: a heading + intro, then the advanced
 * sections at the same 48px section rhythm the page uses elsewhere. Each section
 * still carries the live <Preview /> exhibit, so every deep knob is demonstrated
 * on the same sample prose as the Basics.
 */
export function AdvancedReference() {
  return (
    <div className="flex w-full flex-col" style={{ gap: 48 }}>
      <header className="flex w-full flex-col gap-3 px-[4px] text-text-primary">
        <h2 className="text-[20px] leading-none font-[560] tracking-[-0.4px]">
          Advanced &amp; reference
        </h2>
        <p className="text-[14px] leading-[1.5] font-medium tracking-[-0.25px] text-wrap-pretty text-text-secondary">
          The Basics above are everything you need to build a good highlighter.
          Below is the full reference for the deeper controls — the complete ink
          model, edge detail, the paper surface, material and effect, boundary
          snapping, the entrance animation, and the renderer tiers. Each entry
          documents what the control does and how it interacts with the rest, and
          every change is shown live on the same sample text. Reach for these when
          you want to fine-tune a look the Basics get you most of the way to.
        </p>
      </header>

      <ShapeSection />
      <InkSection />
      <EdgeSection />
      <PaperSection />
      <EffectSection />
      <SnapSection />
      <AnimationSection />
      <RendererSection />
    </div>
  );
}
