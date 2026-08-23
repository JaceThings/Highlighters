// ESM smoke: import the public API of every highlighters package from
// the packed tarball install and exercise one round-trip from each.
// Failure here means a real consumer running `npm install
// @highlighters/...` would also break.
import * as core from "@highlighters/core";
import * as react from "@highlighters/react";
import * as svelte from "@highlighters/svelte";
import * as vue from "@highlighters/vue";

import {
  assertNonEmptyContract,
  parseExportContract,
  parseResolvedOptions,
} from "./export-contract.cjs";

const coreContract = parseExportContract(core, "@highlighters/core", [
  "highlight",
  "highlightAll",
  "highlightSelection",
  "group",
  "resolveOptions",
]);

// Core: the pure config/geometry surface resolves options without a DOM.
parseResolvedOptions(coreContract.call("resolveOptions"), "resolveOptions()");

// Core: the curated palettes are shipped data.
coreContract.record("PALETTES");

// Wrappers: each adapter package exposes at least one binding. We assert
// the namespace is non-empty rather than pinning symbol names, so the
// smoke stays resilient to internal wrapper renames.
assertNonEmptyContract(parseExportContract(react, "@highlighters/react", []));
assertNonEmptyContract(parseExportContract(vue, "@highlighters/vue", []));
assertNonEmptyContract(parseExportContract(svelte, "@highlighters/svelte", []));

console.log("[esm-smoke] OK");
