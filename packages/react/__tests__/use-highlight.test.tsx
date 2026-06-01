// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

// Mock the core so we can observe that the wrapper delegates fully to its
// `highlight()` pipeline (blueprint A1) and forwards updates to the handle.
const handleSpies = {
  show: vi.fn(),
  hide: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  isShowing: vi.fn(() => true),
};
const highlightMock = vi.fn(() => ({ ...handleSpies, tier: "css" as const }));

vi.mock("@highlighters/core", () => ({
  highlight: highlightMock,
}));

const { useHighlight } = await import("../src/use-highlight.js");
const { Highlight } = await import("../src/highlight.js");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  highlightMock.mockClear();
  for (const spy of Object.values(handleSpies)) spy.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: React.ReactElement): void {
  act(() => root.render(element));
}

describe("useHighlight", () => {
  it("calls core highlight() once on mount with the target element and options", () => {
    function Probe(): React.ReactElement {
      const ref = useRef<HTMLParagraphElement>(null);
      useHighlight(ref, { preset: "mild" });
      return <p ref={ref}>Highlight me</p>;
    }

    render(<Probe />);
    expect(highlightMock).toHaveBeenCalledTimes(1);
    const [target, options] = highlightMock.mock.calls[0];
    expect((target as Element).tagName).toBe("P");
    expect(options).toEqual({ preset: "mild" });
  });

  it("removes the mark via handle.remove() on unmount", () => {
    function Probe(): React.ReactElement {
      const ref = useRef<HTMLParagraphElement>(null);
      useHighlight(ref, {});
      return <p ref={ref}>text</p>;
    }

    render(<Probe />);
    expect(handleSpies.remove).not.toHaveBeenCalled();
    act(() => root.unmount());
    expect(handleSpies.remove).toHaveBeenCalledTimes(1);
    // Re-create a root so afterEach's unmount has a live target.
    container = document.createElement("div");
    root = createRoot(container);
  });

  it("delegates option changes to handle.update() without re-creating the mark", () => {
    function Probe({ opacity }: { opacity: number }): React.ReactElement {
      const ref = useRef<HTMLSpanElement>(null);
      useHighlight(ref, { opacity });
      return <span ref={ref}>text</span>;
    }

    render(<Probe opacity={0.5} />);
    expect(highlightMock).toHaveBeenCalledTimes(1);
    handleSpies.update.mockClear();

    render(<Probe opacity={0.9} />);
    // The mark is not re-created (still one highlight() call); the changed
    // options flow through update() (R22d: preserve stable geometry).
    expect(highlightMock).toHaveBeenCalledTimes(1);
    expect(handleSpies.update).toHaveBeenCalled();
    expect(handleSpies.update).toHaveBeenLastCalledWith({ opacity: 0.9 });
  });

  it("recovers a deferred target — a bare ref populated after mount still highlights", () => {
    function Probe({ show }: { show: boolean }): React.ReactElement {
      const ref = useRef<HTMLParagraphElement>(null);
      useHighlight(ref, {});
      return show ? <p ref={ref}>text</p> : <span>placeholder</span>;
    }

    render(<Probe show={false} />);
    expect(highlightMock).not.toHaveBeenCalled(); // no element yet → no mark
    render(<Probe show />); // element appears → recovery effect creates the mark
    expect(highlightMock).toHaveBeenCalledTimes(1);
    const [target] = highlightMock.mock.calls[0];
    expect((target as Element).tagName).toBe("P");
  });
});

describe("<Highlight>", () => {
  it("renders the requested element with its children and highlights it", () => {
    render(
      <Highlight as="p" options={{ preset: "wet" }}>
        Marked text
      </Highlight>,
    );
    const el = container.querySelector("p");
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe("Marked text");
    expect(highlightMock).toHaveBeenCalledTimes(1);
  });

  it("defaults to a span and forwards arbitrary props", () => {
    render(
      <Highlight className="custom" data-test="x">
        inline
      </Highlight>,
    );
    const el = container.querySelector("span");
    expect(el).not.toBeNull();
    expect(el!.className).toBe("custom");
    expect(el!.getAttribute("data-test")).toBe("x");
  });

  it("re-creates the mark on an `as` element swap (and removes the old one)", () => {
    render(<Highlight as="span">x</Highlight>);
    expect(container.querySelector("span")).not.toBeNull();
    expect(highlightMock).toHaveBeenCalledTimes(1);

    render(<Highlight as="p">x</Highlight>);
    // The element type changed: the old node's mark is removed and a new one is
    // created on the new node (rather than being stranded on the unmounted span).
    expect(container.querySelector("p")).not.toBeNull();
    expect(container.querySelector("span")).toBeNull();
    expect(handleSpies.remove).toHaveBeenCalled();
    expect(highlightMock).toHaveBeenCalledTimes(2);
  });
});
