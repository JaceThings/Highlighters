// SSR smoke: importing @highlighters/core (and its /path subpath) in a
// non-DOM environment MUST NOT touch window/document at module load and
// MUST NOT throw (R34). The pure config/geometry path must produce a
// deterministic result on the server with no browser globals present.
// Failure here means SSR consumers (Next, Remix, Astro, edge runtimes)
// would crash on import - a class of regression hard to catch in
// DOM-emulated unit tests.
import assert from "node:assert/strict";

import { parseExportContract, parseResolvedOptions } from "./export-contract.cjs";

assert.ok(!("document" in globalThis), "SSR smoke must run without a document global");
assert.ok(!("window" in globalThis), "SSR smoke must run without a window global");

const core = await import("@highlighters/core");
const corePath = await import("@highlighters/core/path");

const coreContract = parseExportContract(core, "@highlighters/core", ["resolveOptions"]);
const pathContract = parseExportContract(corePath, "@highlighters/core/path", ["resolveOptions"]);

// Resolving options is a pure, DOM-free operation and must work server-side.
const resolved = parseResolvedOptions(
  coreContract.call("resolveOptions", { opacity: 0.7 }),
  "resolveOptions()",
);

// Determinism: the same options resolve identically across both entry points.
assert.deepEqual(
  pathContract.call("resolveOptions", { opacity: 0.7 }),
  resolved,
  "the /path subpath and main entry must resolve identical options",
);

console.log("[ssr-smoke] OK");
