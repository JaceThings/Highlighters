import type { ReactNode } from "react";
import { RuledPaper } from "./RuledPaper.tsx";
import { DOCK_H } from "./dock/constants.ts";

// Bottom clearance so the footer clears the fixed dock (DOCK_H + 24px rest + ~7px).
const FOOTER_CLEARANCE_PX = DOCK_H + 24 + 7;

// `@container/column` exposes the column width as `100cqi` for the preview. Top
// padding is a 1.5rem multiple so text lines land on the ruled grid.
const ARTICLE_BASE =
  "@container/column relative flex w-[510px] max-w-full flex-col items-stretch pt-[4.5rem] pb-20 max-[560px]:w-[calc(100vw-32px)] max-[560px]:pt-6 max-[560px]:pb-16";

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
      className="relative flex min-h-dvh w-full items-stretch justify-center bg-bg"
      style={{ paddingBottom: FOOTER_CLEARANCE_PX }}
    >
      <RuledPaper />
      <article className={`${ARTICLE_BASE} ${articleClassName ?? "gap-9"}`}>
        {children}
      </article>
    </main>
  );
}
