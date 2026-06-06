// Ruled-paper background: a 1px line every 24px band, placed ~18px down each band (near the baseline)
// rather than the band edge, so the docs copy rests on the rule like notebook paper. Layout's top
// padding sets the content phase so the lines stay registered down the page.
const LINE = "rgba(var(--primary-rgb), 0.06)";
const BASELINE = 18; // px from each band top to the text baseline

export function RuledPaper() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${BASELINE}px, ${LINE} ${BASELINE}px, ${LINE} ${BASELINE + 1}px, transparent ${BASELINE + 1}px, transparent 24px)`,
      }}
    />
  );
}
