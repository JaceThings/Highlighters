import type { ReactNode } from "react";
import { RuledPaper } from "./RuledPaper.tsx";
import { DOCK_H } from "./dock/constants.ts";

// Bottom clearance so the footer always clears the fixed dock when scrolled to
// the end: the dock is DOCK_H tall, rests `bottom-6` (24px) off the bottom, plus
// ~7px breathing room. Derived from DOCK_H so it tracks the dock if that changes.
const FOOTER_CLEARANCE_PX = DOCK_H + 24 + 7;

// `@container/column` lets descendants read the column width via `100cqi`
// (used by the playground preview). Overlay effects (`FocusRingOverlay`,
// the selection highlight) are intentionally mounted at App root, not
// here, so they persist across route changes.
const ARTICLE_BASE =
  "@container/column relative flex w-[510px] max-w-full flex-col items-stretch py-20 max-[560px]:w-[calc(100vw-32px)] max-[560px]:pt-6 max-[560px]:pb-16";

export function Layout({
  children,
  articleClassName,
}: {
  children: ReactNode;
  /** Tailwind classes appended to the article shell — e.g. `gap-9`
   *  for Home, smaller gaps for text-heavy pages. */
  articleClassName?: string;
}) {
  return (
    // `relative` anchors the ruled-paper layer; the bottom padding (derived from
    // DOCK_H, see FOOTER_CLEARANCE_PX) keeps the footer clear of the fixed dock.
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
