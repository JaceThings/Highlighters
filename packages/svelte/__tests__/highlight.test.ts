// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { highlight } from "../src/highlight.js";
import type { MarkHandle } from "@highlighters/core";

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

describe("highlight action - lifecycle", () => {
  it("returns an action with update() and destroy()", () => {
    const node = document.createElement("p");
    node.textContent = "Highlight me";
    container.appendChild(node);

    const action = highlight(node, { preset: "mild" });
    expect(typeof action.update).toBe("function");
    expect(typeof action.destroy).toBe("function");
    action.destroy();
  });

  it("creates a core mark handle delegating to the core pipeline", () => {
    // The action must call core highlight() - we observe by checking it does not
    // throw and leaves the element's text intact (R29: no text mutation).
    const node = document.createElement("p");
    node.textContent = "Highlight me";
    container.appendChild(node);

    const action = highlight(node, { preset: "wet" });
    expect(node.textContent).toBe("Highlight me");
    action.destroy();
    expect(node.textContent).toBe("Highlight me");
  });

  it("update() forwards new options without throwing", () => {
    const node = document.createElement("span");
    node.textContent = "text";
    container.appendChild(node);

    const action = highlight(node, { preset: "mild" });
    expect(() => action.update({ opacity: 0.9, color: "pink" })).not.toThrow();
    expect(() => action.update()).not.toThrow();
    action.destroy();
  });

  it("destroy() restores the DOM (no orphaned overlay residue under the node)", () => {
    const node = document.createElement("p");
    node.textContent = "Highlight me";
    container.appendChild(node);

    const before = container.innerHTML;
    const action = highlight(node, {});
    action.destroy();
    // The overlay attaches to document.body, not the node; the node subtree must
    // be byte-identical after destroy (R9 restores DOM to pre-highlight state).
    expect(container.innerHTML).toBe(before);
  });

  it("update() is callable repeatedly and destroy() is the final teardown", () => {
    const node = document.createElement("p");
    node.textContent = "abc";
    container.appendChild(node);

    const action = highlight(node);
    const handleCalls: MarkHandle["update"][] = [];
    handleCalls.push(action.update as unknown as MarkHandle["update"]);
    action.update({ snap: "word" });
    action.update({ snap: "line" });
    expect(() => action.destroy()).not.toThrow();
  });
});
