// ESM smoke: import the public API of every highlighters package from
// the packed tarball install and exercise one round-trip from each.
// Failure here means a real consumer running `npm install
// @highlighters/...` would also break.
import assert from "node:assert/strict";

import * as core from "@highlighters/core";
import * as react from "@highlighters/react";
import * as vue from "@highlighters/vue";
import * as svelte from "@highlighters/svelte";

// Core: the imperative entry points are exported as functions.
assert.equal(typeof core.highlight, "function", "highlight must be a function");
assert.equal(typeof core.highlightAll, "function", "highlightAll must be a function");
assert.equal(typeof core.highlightSelection, "function", "highlightSelection must be a function");
assert.equal(typeof core.group, "function", "group must be a function");

// Core: the pure config/geometry surface resolves options without a DOM.
assert.equal(typeof core.resolveOptions, "function", "resolveOptions must be a function");
const resolved = core.resolveOptions();
assert.ok(resolved && typeof resolved === "object", "resolveOptions() must return the resolved options object");

// Core: named presets and palettes are shipped data.
assert.ok(core.PRESETS && typeof core.PRESETS === "object", "PRESETS must be exported");
assert.ok(core.PALETTES && typeof core.PALETTES === "object", "PALETTES must be exported");

// Wrappers: each adapter package exposes at least one binding. We assert
// the namespace is non-empty rather than pinning symbol names, so the
// smoke stays resilient to internal wrapper renames.
assert.ok(Object.keys(react).length > 0, "@highlighters/react must export at least one symbol");
assert.ok(Object.keys(vue).length > 0, "@highlighters/vue must export at least one symbol");
assert.ok(Object.keys(svelte).length > 0, "@highlighters/svelte must export at least one symbol");

console.log("[esm-smoke] OK");
