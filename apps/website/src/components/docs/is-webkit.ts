// WebKit (Safari + every iOS browser) can't rasterize SVG turbulence/filter chains at speed -
// on the /docs page, 8 marks + ~26 scribble decorations dropped it to ~27fps while Blink/Gecko
// held 60. So WebKit gets cheaper equivalents: a pre-baked paper raster and filterless scribbles.
// `navigator.vendor` is the robust signal (true for desktop Safari AND all iOS browsers); the UA
// regex is a fallback.
export const IS_WEBKIT =
  typeof navigator !== "undefined" &&
  (navigator.vendor === "Apple Computer, Inc." ||
    /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent));
