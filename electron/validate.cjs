'use strict';
/**
 * Type and shape checks for every IPC argument (AC-22). A failed check throws
 * Error('invalid-argument') — a short code, never the offending value.
 * The file-system and search handlers extend this module with their own
 * shapes; the primitives here are shared.
 */

const MAX_PATH = 32767; // Windows extended-length limit
const MAX_QUERY = 500;

function invalid() {
  return new Error('invalid-argument');
}

function assertString(value, { max = 4096, allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw invalid();
  if (!allowEmpty && value.length === 0) throw invalid();
  if (value.length > max) throw invalid();
  return value;
}

function assertBoolean(value) {
  if (typeof value !== 'boolean') throw invalid();
  return value;
}

function assertInteger(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw invalid();
  return value;
}

function assertPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw invalid();
  return value;
}

/** A path argument: a non-empty string without NUL bytes. Whether it is ALLOWED is security.cjs' job. */
function assertPath(value) {
  assertString(value, { max: MAX_PATH });
  if (value.includes('\0')) throw invalid();
  return value;
}

/** SearchRequest of the bridge contract, with the 500-character query limit. */
function assertSearchRequest(value) {
  assertPlainObject(value);
  assertString(value.id, { max: 100 });
  assertPath(value.root);
  assertString(value.query, { max: MAX_QUERY, allowEmpty: true });
  assertBoolean(value.caseSensitive);
  assertBoolean(value.wholeWord);
  assertBoolean(value.regex);
  assertString(value.include, { max: 2000, allowEmpty: true });
  assertString(value.exclude, { max: 2000, allowEmpty: true });
  return value;
}

/** MenuState of the bridge contract. */
function assertMenuState(value) {
  assertPlainObject(value);
  assertBoolean(value.wordWrap);
  if (value.theme !== 'dark' && value.theme !== 'light') throw invalid();
  return value;
}

module.exports = {
  MAX_PATH,
  MAX_QUERY,
  assertString,
  assertBoolean,
  assertInteger,
  assertPlainObject,
  assertPath,
  assertSearchRequest,
  assertMenuState,
};
