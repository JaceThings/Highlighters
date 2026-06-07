// SSR smoke: importing @highlighters/core (and its /path subpath) in a
// non-DOM environment MUST NOT touch window/document at module load and
// MUST NOT throw (R34). The pure config/geometry path must produce a
// deterministic result on the server with no browser globals present.
// Failure here means SSR consumers (Next, Remix, Astro, edge runtimes)
// would crash on import - a class of regression hard to catch in
// DOM-emulated unit tests.
import assert from "node:assert/strict";

assert.equal(typeof globalThis.document, "undefined", "SSR smoke must run without a document global");
assert.equal(typeof globalThis.window, "undefined", "SSR smoke must run without a window global");

const core = await import("@highlighters/core");
const corePath = await import("@highlighters/core/path");

// Resolving options is a pure, DOM-free operation and must work server-side.
const resolved = core.resolveOptions({ opacity: 0.7 });
assert.ok(resolved && typeof resolved === "object", "resolveOptions() must return an object on the server");

// Determinism: the same options resolve identically across both entry points.
const fromPath = corePath.resolveOptions({ opacity: 0.7 });
assert.deepEqual(
  fromPath,
  resolved,
  "the /path subpath and main entry must resolve identical options",
);

console.log("[ssr-smoke] OK");
