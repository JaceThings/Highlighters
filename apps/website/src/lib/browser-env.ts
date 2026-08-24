export interface BrowserCapabilities {
  hasWindow: boolean;
  hasNavigator: boolean;
  hasMatchMedia: boolean;
  hasIdleCallback: boolean;
  hasIntersectionObserver: boolean;
  isWebKit: boolean;
}

function hasGlobal(name: string): boolean {
  return name in globalThis;
}

function readBrowser(): BrowserCapabilities {
  const hasWindow = hasGlobal("window");
  const hasNavigator = hasGlobal("navigator");
  return {
    hasWindow,
    hasNavigator,
    hasMatchMedia: hasWindow && "matchMedia" in window,
    hasIdleCallback: hasWindow && "requestIdleCallback" in window,
    hasIntersectionObserver: hasGlobal("IntersectionObserver"),
    isWebKit:
      hasNavigator &&
      (navigator.vendor === "Apple Computer, Inc." ||
        /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent)),
  };
}

export const BROWSER: BrowserCapabilities = readBrowser();
