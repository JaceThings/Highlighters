import { useEffect, useId, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { armDemoPaperSelectionBlock } from "./demoPaperSelection.ts";
import paperBg from "./paperBg.ts";
import { IS_WEBKIT } from "./is-webkit.ts";

const SHEET_SIZE = { width: "110%", height: "calc(100% * 313 / 288)" } as const;

export function PaperCard({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svg = useMemo(() => (IS_WEBKIT ? "" : paperBg.replace(/2069_66/g, uid)), [uid]);

  useEffect(() => {
    const disarm = armDemoPaperSelectionBlock();
    const el = rootRef.current;
    if (!el) return disarm;
    const block = (e: Event) => e.preventDefault();
    el.addEventListener("selectstart", block);
    return () => {
      el.removeEventListener("selectstart", block);
      disarm();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-highlight-exclude
      className={`demo-paper relative isolate flex select-none flex-col ${className ?? ""}`}
      style={{ minHeight: 288, ...style }}
    >
      {IS_WEBKIT ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2 bg-[length:100%_100%] bg-no-repeat"
          style={{ ...SHEET_SIZE, backgroundImage: "url(/paper-sheet.webp)" }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2"
          style={{ ...SHEET_SIZE, maxWidth: "none" }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}
