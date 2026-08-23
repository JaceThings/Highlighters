const assert = require("node:assert/strict");

function isCallable(value) {
  return value instanceof Function;
}

function isRecord(value) {
  return value !== null && value !== undefined && Object(value) === value && !isCallable(value);
}

function parseExportContract(namespace, label, requiredCallables) {
  assert.ok(isRecord(namespace), `${label} must resolve to a module namespace`);

  const callables = new Map();
  for (const name of requiredCallables) {
    const value = namespace[name];
    assert.ok(isCallable(value), `${label} must export ${name} as a callable export`);
    callables.set(name, value);
  }

  const symbols = Object.keys(namespace);

  return {
    label,
    symbolCount: symbols.length,
    call(name, ...args) {
      const callable = callables.get(name);
      assert.ok(callable !== undefined, `${name} is not part of the ${label} export contract`);
      return callable(...args);
    },
    record(name) {
      const value = namespace[name];
      assert.ok(isRecord(value), `${label} must export ${name} as a data record`);
      return value;
    },
  };
}

function parseResolvedOptions(value, label) {
  assert.ok(isRecord(value), `${label} must return the resolved options object`);
  return value;
}

function assertNonEmptyContract(contract) {
  assert.ok(contract.symbolCount > 0, `${contract.label} must export at least one symbol`);
  return contract;
}

exports.parseExportContract = parseExportContract;
exports.parseResolvedOptions = parseResolvedOptions;
exports.assertNonEmptyContract = assertNonEmptyContract;
