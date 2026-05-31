// The dock's fixed pixel height (Figma "Toolbar" content = 145). Everything in
// the tray scales off this single number: the capsule height, the cap SVG's
// native source-canvas height, and the marker clip-frame height. Centralised so
// the three stay in lockstep — the geometry is pixel-tuned, so they must match.
export const DOCK_H = 145;
