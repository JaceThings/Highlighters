// Per-section dividers (Figma `#edece8` 1px top border between every
// figure-content slot). A `box-shadow: inset` lives inside the element's
// padding box, so the hairline tucks behind the FigureCard's Lisse clip
// at the rounded edges — a real `border-top` would visibly peek past
// the corner clip on the left/right.
export const ROW_DIVIDER = "shadow-[inset_0_1px_0_0_#edece8]";

// Padded wrapper for a Slider control row inside a FigureCard: a hairline on top
// (the ROW_DIVIDER) plus 16px of breathing room around the track. Shared by every
// section that stacks sliders so the figure-row rhythm stays identical.
export const SLIDER_ROW = `flex w-full flex-col items-center justify-center p-4 ${ROW_DIVIDER}`;
