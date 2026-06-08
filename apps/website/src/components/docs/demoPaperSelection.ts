function inDemoPaper(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement;
  return el?.closest(".demo-paper") != null;
}

/** Drop selection ranges that touch demo-paper content (covers Cmd+A over the whole page). */
function pruneDemoPaperFromSelection(): void {
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const kept: Range[] = [];
  for (let i = 0; i < sel.rangeCount; i++) {
    const r = sel.getRangeAt(i);
    if (!inDemoPaper(r.startContainer) && !inDemoPaper(r.endContainer)) kept.push(r);
  }
  if (kept.length === sel.rangeCount) return;
  sel.removeAllRanges();
  for (const r of kept) sel.addRange(r);
}

let armed = 0;

/** One shared listener while any demo paper is mounted. */
export function armDemoPaperSelectionBlock(): () => void {
  if (armed++ === 0) document.addEventListener("selectionchange", pruneDemoPaperFromSelection);
  return () => {
    if (--armed === 0) document.removeEventListener("selectionchange", pruneDemoPaperFromSelection);
  };
}
