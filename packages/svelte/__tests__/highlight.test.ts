import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { highlight, type HighlightAction } from "../src/highlight.js";

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
    expect(action.update).toBeInstanceOf(Function);
    expect(action.destroy).toBeInstanceOf(Function);
    action.destroy();
  });

  it("creates a core mark handle delegating to the core pipeline", () => {
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
    expect(container.innerHTML).toBe(before);
  });

  it("update() is callable repeatedly and destroy() is the final teardown", () => {
    const node = document.createElement("p");
    node.textContent = "abc";
    container.appendChild(node);

    const action = highlight(node);
    const handleCalls: HighlightAction["update"][] = [];
    handleCalls.push(action.update);
    action.update({ snap: "word" });
    action.update({ snap: "line" });
    expect(() => action.destroy()).not.toThrow();
  });
});
