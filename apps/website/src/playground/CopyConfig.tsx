import { useMemo, useState } from "react";
import { resolveOptions } from "@highlighters/core";
import type { HighlightOptions, ResolvedOptions } from "@highlighters/core";
import { CheckIcon, CopyIcon } from "../icons/sf/index.tsx";
import { Card } from "../components/Card.tsx";
import { IconSwap } from "../components/IconSwap.tsx";
import { Section } from "../components/playground/Section.tsx";
import { playCopySuccess } from "../lib/sounds.ts";
import {
  STACK_DEFAULT,
  TIP_OVERSHOOT_DEFAULT,
  TIP_OVERSHOOT_JITTER_DEFAULT,
  toCoreOptions,
  usePlaygroundOptions,
  type PlaygroundOptions,
} from "./options-context.tsx";

const ICON_TRANSITION = "transition-colors duration-300 ease-out-quint";

// The resolved baseline (no preset, no user input) every live value is diffed
// against so the emitted snippet carries only the keys the user actually changed.
const DEFAULTS: ResolvedOptions = resolveOptions({});

// The namespaced groups we diff field-wise (R: tip/ink/edge/paper/glow/animation).
const GROUPS = ["tip", "ink", "edge", "paper", "glow", "animation"] as const;

/** Round floats to 2dp for a clean snippet; pass integers/strings through. */
function tidy(v: unknown): unknown {
  return typeof v === "number" && !Number.isInteger(v)
    ? Math.round(v * 100) / 100
    : v;
}

/**
 * Build the minimal {@link HighlightOptions} that reproduces the live look: lower
 * the playground build to core options, fully resolve both it and the bare
 * defaults, then keep only the fields that differ. The namespaced groups are
 * diffed field-wise so a snippet shows just the one ink knob the user touched,
 * not the whole group.
 *
 * The emitted config speaks the phase-1 vocabulary the user can actually set:
 * the `stack` boolean (NOT the underlying blend mode it lowers to, which is no
 * longer a user-facing knob) and the `tip.overshoot` / `tip.overshootJitter` end
 * knobs. Anything left at the playground default is omitted.
 */
function diffFromDefaults(live: PlaygroundOptions): HighlightOptions {
  const r = resolveOptions(toCoreOptions(live));
  const out: Record<string, unknown> = {};

  // Top-level scalars worth emitting (skip the resolved-only `gradient`/`seed`
  // /`contrastBackground` plumbing that the user never set here). `blendMode` is
  // intentionally NOT emitted — `stack` owns the compositing model now.
  if (r.markType !== DEFAULTS.markType) out.markType = r.markType;
  if (r.color !== DEFAULTS.color) out.color = r.color;
  if (r.opacity !== DEFAULTS.opacity) out.opacity = tidy(r.opacity);
  // The phase-1 stack boolean, emitted only when it differs from the default.
  const stack = live.stack ?? STACK_DEFAULT;
  if (stack !== STACK_DEFAULT) out.stack = stack;
  if (r.colorant !== DEFAULTS.colorant) out.colorant = tidy(r.colorant);
  if (r.quality !== DEFAULTS.quality) out.quality = r.quality;
  if (r.snap !== DEFAULTS.snap) out.snap = r.snap;
  if (r.renderer !== DEFAULTS.renderer) out.renderer = r.renderer;
  if (r.semantic !== DEFAULTS.semantic) out.semantic = r.semantic;

  for (const group of GROUPS) {
    const liveGroup = r[group] as unknown as Record<string, unknown>;
    const defGroup = DEFAULTS[group] as unknown as Record<string, unknown>;
    const changed: Record<string, unknown> = {};
    for (const field of Object.keys(liveGroup)) {
      if (liveGroup[field] !== defGroup[field]) {
        changed[field] = tidy(liveGroup[field]);
      }
    }
    if (Object.keys(changed).length > 0) out[group] = changed;
  }

  // The phase-1 tip end knobs live on the playground's tip group (the core tip
  // group doesn't carry them, so the resolved diff above can't see them). Emit
  // each only when it differs from its baseline, into the same `tip` block.
  const overshoot = live.tip?.overshoot ?? TIP_OVERSHOOT_DEFAULT;
  const overshootJitter =
    live.tip?.overshootJitter ?? TIP_OVERSHOOT_JITTER_DEFAULT;
  const tipExtras: Record<string, unknown> = {};
  if (overshoot !== TIP_OVERSHOOT_DEFAULT) tipExtras.overshoot = tidy(overshoot);
  if (overshootJitter !== TIP_OVERSHOOT_JITTER_DEFAULT) {
    tipExtras.overshootJitter = tidy(overshootJitter);
  }
  if (Object.keys(tipExtras).length > 0) {
    out.tip = { ...(out.tip as Record<string, unknown> | undefined), ...tipExtras };
  }

  return out as HighlightOptions;
}

/** Pretty-print an options object as a TS literal (2-space indent, one level). */
function printOptions(opts: HighlightOptions): string {
  const entries = Object.entries(opts);
  if (entries.length === 0) return "{}";
  const lines = entries.map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const inner = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
        .join("\n");
      return `  ${key}: {\n${inner}\n  },`;
    }
    return `  ${key}: ${JSON.stringify(value)},`;
  });
  return `{\n${lines.join("\n")}\n}`;
}

export function CopyConfig() {
  const { options } = usePlaygroundOptions();
  const [copied, setCopied] = useState(false);

  // Recompute the snippet whenever the live build changes.
  const snippet = useMemo(() => {
    const diff = diffFromDefaults(options);
    return [
      `import { highlightSelection } from "@highlighters/core";`,
      ``,
      `highlightSelection(${printOptions(diff)});`,
    ].join("\n");
  }, [options]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      playCopySuccess();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard denied — leave the idle icon; the snippet is still selectable.
    }
  }

  return (
    <Section
      title="Your highlighter"
      description="Everything above, as code. This is the look you built — copy it straight into your project. Only the values you changed from the defaults are emitted."
    >
      <Card>
        <div className="flex w-full flex-col bg-surface">
          <div className="flex w-full items-center justify-between gap-2 px-3.5 pt-3 pb-1">
            <span className="font-mono text-[12px] leading-none font-medium tracking-[-0.1px] text-[rgba(126,117,108,0.7)]">
              @highlighters/core
            </span>
            <button
              type="button"
              data-focus-ring
              onClick={handleCopy}
              aria-label="Copy your highlighter config to clipboard"
              className="inline-flex cursor-pointer items-center gap-1.5 p-1.5 -m-1.5 text-[12px] leading-none font-medium tracking-[-0.1px]"
            >
              <span className={copied ? "text-accent-green" : "text-text-input"}>
                {copied ? "Copied" : "Copy"}
              </span>
              <IconSwap
                size={16}
                className={`${copied ? "text-accent-green" : "text-text-input"} ${ICON_TRANSITION}`}
                layers={[
                  {
                    key: "copy",
                    active: !copied,
                    node: <CopyIcon width={15} height={16} />,
                  },
                  {
                    key: "check",
                    active: copied,
                    node: <CheckIcon width={15} height={15} />,
                  },
                ]}
              />
            </button>
          </div>
          <pre className="w-full overflow-x-auto px-3.5 pt-1 pb-3.5 font-mono text-[13px] leading-[1.55] font-medium tracking-[-0.25px] text-text-input">
            <code>{snippet}</code>
          </pre>
        </div>
      </Card>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {copied ? "Copied your highlighter config to clipboard" : ""}
      </p>
    </Section>
  );
}
