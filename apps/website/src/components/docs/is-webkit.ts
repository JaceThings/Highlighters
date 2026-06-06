// WebKit (Safari + every iOS browser) can't rasterize SVG turbulence/filter chains at speed, so it
// gets cheaper equivalents (pre-baked paper raster, filterless scribbles). `navigator.vendor` is the
// robust signal (true for desktop Safari AND all iOS browsers); the UA regex is a fallback.
export const IS_WEBKIT =
  typeof navigator !== "undefined" &&
  (navigator.vendor === "Apple Computer, Inc." ||
    /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent));
