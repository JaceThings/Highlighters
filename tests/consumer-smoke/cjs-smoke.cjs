// CJS smoke: require @highlighters/core. The framework adapters are
// ESM-first; core supports CJS via dual exports and is the surface a CJS
// consumer would actually call.
const core = require("@highlighters/core");

const { parseExportContract, parseResolvedOptions } = require("./export-contract.cjs");

const coreContract = parseExportContract(core, "@highlighters/core", [
  "highlight",
  "resolveOptions",
]);

parseResolvedOptions(coreContract.call("resolveOptions"), "resolveOptions()");

console.log("[cjs-smoke] OK");
