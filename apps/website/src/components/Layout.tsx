import type { ReactNode } from "react";
import { RuledPaper } from "./RuledPaper.tsx";
import { DOCK_H } from "./dock/constants.ts";

const FOOTER_CLEARANCE_PX = DOCK_H + 24 + 7;

const ARTICLE_BASE =
  "@container/column relative flex w-[510px] max-w-full flex-col items-stretch pt-[66px] pb-20 max-[560px]:w-[calc(100vw-32px)] max-[560px]:pt-[43px] max-[560px]:pb-16";

export function Layout({
  children,
  articleClassName,
}: {
  children: ReactNode;
  articleClassName?: string;
}) {
  return (
    <main
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
