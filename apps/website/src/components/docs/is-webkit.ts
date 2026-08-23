export const IS_WEBKIT =
  typeof navigator !== "undefined" &&
  (navigator.vendor === "Apple Computer, Inc." ||
    /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent));
