// Subpath smoke: @highlighters/core exports a `./path` subpath - the
// DOM-free, SSR-safe surface (pure geometry + config + types).
// Resolution failure here would mean package.json#exports got broken - a
// class of regression the source-aliased tests cannot see.
import assert from "node:assert/strict";

import * as corePath from "@highlighters/core/path";

import { parseExportContract } from "./export-contract.cjs";

// The subpath must expose the pure config + geometry helpers and nothing
// that touches the DOM.
const pathContract = parseExportContract(corePath, "@highlighters/core/path", [
  "resolveOptions",
  "buildMarkGeometry",
]);

assert.ok(pathContract.symbolCount > 0, "core/path must export at least one symbol");

console.log(`[subpath-smoke] OK (${pathContract.symbolCount} symbols)`);
