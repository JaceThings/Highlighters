import { Divider } from "./Divider.tsx";
import { Stagger } from "./Stagger.tsx";

// Definitions stay as <p> not <dl>: the visible "1, 2, b, 3" numbering is
// part of the prose, so <dt>/<dd> would announce the leading digit twice.
const DEF = "text-[14px] leading-[1.2] font-medium tracking-[-0.25px]";

interface HeaderProps {
  /** Reveal index for the heading row; each definition line rises by 1. */
  staggerFrom: number;
}

export function Header({ staggerFrom }: HeaderProps) {
  return (
    <header className="flex w-full flex-col gap-5">
      <div
        className="flex w-full flex-col gap-2.5"
        role="group"
        aria-labelledby="highlighters-heading"
      >
        <Stagger index={staggerFrom}>
          <div className="flex items-end gap-2 whitespace-nowrap text-text-primary">
            <h1
              id="highlighters-heading"
              className="relative text-[16px] leading-none font-[550] tracking-[-0.25px]"
            >
              highlighters
            </h1>
            <p className="text-[14px] leading-none font-[450] tracking-[-0.25px]">
              <span aria-hidden>
                /ˈhʌɪˌlʌɪtəz/ <em className="italic">n.</em> [the{" "}
                <em className="italic">mark</em>,{" "}
                <em className="italic">drawn</em>]
              </span>
              <span className="sr-only">
                Highlighters, noun, the mark, drawn.
              </span>
            </p>
          </div>
        </Stagger>
        <div className="flex flex-col gap-2 pl-2 text-text-secondary">
          <Stagger index={staggerFrom + 1}>
            <p className={DEF}>
              <span className="font-[550] proportional-nums">1</span> a realistic
              ink mark laid over text; a translucent band that darkens where it
              overlaps (
              <em className="italic">a wet-pooled swipe</em>).
            </p>
          </Stagger>
          <Stagger index={staggerFrom + 2}>
            <p className={DEF}>
              <span className="font-[550] proportional-nums">2</span> a chisel-tip
              stroke with frayed, feathered edges and lengthwise streaks.
            </p>
          </Stagger>
          <Stagger index={staggerFrom + 3}>
            <p className={`pl-2 ${DEF}`}>
              <span className="font-[550] proportional-nums">b</span> (of an
              underline or strike-through) the same physics, positioned low or
              centred on the line.
            </p>
          </Stagger>
          <Stagger index={staggerFrom + 4}>
            <p className={DEF}>
              <span className="font-[550] proportional-nums">3</span> fig. tunable,
              deterministic; the same marks server and client, every render.
            </p>
          </Stagger>
        </div>
      </div>
      <Stagger index={staggerFrom + 5}>
        <Divider />
      </Stagger>
    </header>
  );
}
