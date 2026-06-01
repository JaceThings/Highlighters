// CJS smoke: require @highlighters/core. The framework adapters are
// ESM-first; core supports CJS via dual exports and is the surface a CJS
// consumer would actually call.
const assert = require("node:assert/strict");
const core = require("@highlighters/core");

assert.equal(typeof core.highlight, "function", "highlight must be a function");
assert.equal(typeof core.resolveOptions, "function", "resolveOptions must be a function");

const resolved = core.resolveOptions();
assert.ok(resolved && typeof resolved === "object", "resolveOptions() must return the resolved options object");

console.log("[cjs-smoke] OK");
