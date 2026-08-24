export function hasGlobal(name: string): boolean {
  return name in globalThis;
}

export function hasDomWithRange(): boolean {
  return hasGlobal("document") && hasGlobal("Range");
}

export function hasDom(): boolean {
  return hasGlobal("document") && hasGlobal("window");
}

export function hasWindow(): boolean {
  return hasGlobal("window");
}

export function hasMediaQueries(): boolean {
  return hasDom() && "matchMedia" in window;
}

export function isTextNode(node: Node | null): node is Text {
  return node != null && node.nodeType === 3;
}

export function nextTextNode(walker: TreeWalker): Text | null {
  const node = walker.nextNode();
  return isTextNode(node) ? node : null;
}

export const SHOW_TEXT = 0x4;
export const FILTER_ACCEPT = 1;
export const FILTER_REJECT = 2;

const NON_RENDERED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "NOSCRIPT",
  "HEAD",
  "TITLE",
]);

export function isInNonRenderedSubtree(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (NON_RENDERED_TAGS.has(el.tagName)) return true;
    el = el.parentElement;
  }
  return false;
}
