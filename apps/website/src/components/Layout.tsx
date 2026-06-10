import type { ReactNode } from "react";
import { RuledPaper } from "./RuledPaper.tsx";
import { DOCK_H } from "./dock/constants.ts";

// Bottom clearance so the footer clears the fixed dock (DOCK_H + 24px rest + ~7px).
const FOOTER_CLEARANCE_PX = DOCK_H + 24 + 7;

// `@container/column` exposes the column width as `100cqi`. Top padding (66px) seats the first text
// line where it should sit against the ruled grid; the column flows on 24px rows from there.
const ARTICLE_BASE =
  "@container/column relative flex w-[510px] max-w-full flex-col items-stretch pt-[66px] pb-20 max-[560px]:w-[calc(100vw-32px)] max-[560px]:pt-[43px] max-[560px]:pb-16";

export function Layout({
  children,
  articleClassName,
}: {
  children: ReactNode;
  /** Tailwind classes appended to the article shell (e.g. `gap-9` for Home). */
  articleClassName?: string;
}) {
  return (
    <main
      // overflow-x-clip: demo cards break out by a negative margin; clip horizontal overflow (no scroll) so it can't reach past the viewport on mobile, leaving vertical scroll untouched.
      className="relative flex min-h-dvh w-full items-stretch justify-center overflow-x-clip bg-bg"
      style={{ paddingBottom: FOOTER_CLEARANCE_PX }}
    >
      <RuledPaper />
      <article className={`${ARTICLE_BASE} ${articleClassName ?? "gap-9"}`}>
        {children}
      </article>
    </main>
  );
}
