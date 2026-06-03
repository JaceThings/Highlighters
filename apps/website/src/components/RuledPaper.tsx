// Ruled-paper background: a 1px warm line at the bottom of each 1.5rem band, via one
// repeating-linear-gradient. Rem-based so it tracks the reader's text size.
const LINE = "rgba(var(--primary-rgb), 0.06)";

export function RuledPaper() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(1.5rem - 1px), ${LINE} calc(1.5rem - 1px), ${LINE} 1.5rem)`,
      }}
    />
  );
}
