// Subpath smoke: @highlighters/core exports a `./path` subpath - the
// DOM-free, SSR-safe surface (pure geometry + config + types).
// Resolution failure here would mean package.json#exports got broken - a
// class of regression the source-aliased tests cannot see.
import assert from "node:assert/strict";
import * as corePath from "@highlighters/core/path";

assert.ok(corePath, "core/path subpath must resolve");

// The subpath must expose the pure config + geometry helpers and nothing
// that touches the DOM.
assert.equal(typeof corePath.resolveOptions, "function", "core/path must export resolveOptions");
assert.equal(typeof corePath.buildMarkGeometry, "function", "core/path must export buildMarkGeometry");

const keys = Object.keys(corePath);
assert.ok(keys.length > 0, "core/path must export at least one symbol");

console.log(`[subpath-smoke] OK (${keys.length} symbols)`);
