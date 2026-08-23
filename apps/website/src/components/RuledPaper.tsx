const LINE = "rgba(var(--primary-rgb), 0.06)";
const BASELINE = 18;

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
