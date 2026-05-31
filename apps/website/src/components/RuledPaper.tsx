// Ruled-paper background: faint horizontal rules every 1.5rem (24px at default
// root size, but rem-based so it tracks the reader's text size). A single
// repeating-linear-gradient draws a 1px warm line at the bottom of each 1.5rem
// band. Absolutely fills its (relative) parent and scrolls with the page like
// real paper. The warm brown is the shared `--primary-rgb` token (page text
// colour) at low alpha.
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
