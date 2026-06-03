// Collapse and Preview both swap render paths around Safari bottlenecks (SVG filter
// rasterisation runs software-side; grid-track transitions can't promote to a
// compositor layer). Resolved once on import — userAgent is stable for the page.
export const IS_SAFARI =
  typeof navigator !== "undefined" &&
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
