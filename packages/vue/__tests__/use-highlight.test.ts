import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp, h, ref, nextTick, type App, type VNode } from "vue";
import { useHighlight } from "../src/use-highlight.js";
import { Highlight } from "../src/highlight.js";
import type { HighlightOptions, MarkHandle, RendererTier } from "@highlighters/core";

const RENDERER_TIERS: readonly RendererTier[] = ["svg", "css", "highlight-api"];

let container: HTMLDivElement;
const apps: App[] = [];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  while (apps.length > 0) apps.pop()?.unmount();
  container.remove();
});

function mount(render: () => VNode): App {
  const app = createApp({ render });
  app.mount(container);
  apps.push(app);
  return app;
}

describe("useHighlight composable", () => {
  it("creates a mark handle once mounted", async () => {
    let getHandle: (() => MarkHandle | null) | null = null;

    mount(() =>
      h({
        setup() {
          const el = ref<HTMLElement | null>(null);
          getHandle = useHighlight(el, { preset: "mild" });
          return () => h("p", { ref: el }, "Highlight me");
        },
      }),
    );

    await nextTick();
    expect(getHandle).not.toBeNull();
    const handle = getHandle!();
    expect(handle).not.toBeNull();
    expect(RENDERER_TIERS).toContain(handle!.tier);
    expect(handle!.remove).toBeInstanceOf(Function);
  });

  it("removes the mark on unmount", async () => {
    let getHandle: (() => MarkHandle | null) | null = null;

    const app = mount(() =>
      h({
        setup() {
          const el = ref<HTMLElement | null>(null);
          getHandle = useHighlight(el, { preset: "wet" });
          return () => h("p", { ref: el }, "text");
        },
      }),
    );

    await nextTick();
    expect(getHandle!()).not.toBeNull();
    app.unmount();
    apps.pop();
    expect(getHandle!()).toBeNull();
  });

  it("delegates option changes to handle.update()", async () => {
    const updates: Partial<HighlightOptions>[] = [];
    const wrapped = new WeakSet<MarkHandle>();
    const opacity = ref(0.5);

    mount(() =>
      h({
        setup() {
          const el = ref<HTMLElement | null>(null);
          const options = ref<{ opacity: number }>({ opacity: opacity.value });
          const getHandle = useHighlight(el, options);
          return () => {
            const handle = getHandle();
            if (handle && !wrapped.has(handle)) {
              const original = handle.update.bind(handle);
              handle.update = (opts) => {
                updates.push(opts);
                original(opts);
              };
              wrapped.add(handle);
            }
            options.value = { opacity: opacity.value };
            return h("span", { ref: el }, "text");
          };
        },
      }),
    );

    await nextTick();
    opacity.value = 0.9;
    await nextTick();
    await nextTick();
    expect(updates.length).toBeGreaterThan(0);
  });
});

describe("<Highlight> component", () => {
  it("renders the requested element with its slot content", async () => {
    mount(() => h(Highlight, { as: "p", options: { preset: "wet" } }, () => "Marked text"));
    await nextTick();
    const el = container.querySelector("p");
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe("Marked text");
  });

  it("defaults to a span", async () => {
    mount(() => h(Highlight, {}, () => "inline"));
    await nextTick();
    expect(container.querySelector("span")).not.toBeNull();
  });
});
