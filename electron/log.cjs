'use strict';
/**
 * Main-process logging. Privacy rule (AC-28): a log line never carries file
 * contents or a full file path.
 *  - The API takes an event name plus small scalar fields — never a buffer.
 *  - Every string that reaches the output is scrubbed: anything that looks
 *    like a path (C:\..., \\server\share, /home/..., file://...) becomes
 *    "<path>", and long strings are cut.
 *  - Errors are reduced to their name, code and a scrubbed message (no stack:
 *    stacks are made of install paths).
 * No telemetry: lines go to the local stdout/stderr only.
 */

const MAX_FIELD = 120;

/** Replaces everything that looks like a file path with "<path>". */
function redact(text) {
  return (
    String(text)
      // quoted paths may contain spaces: 'C:\Program Files\x', "/home/a b/c"
      .replace(/(['"`])(?:[a-zA-Z]:[\\/]|\\\\|\/)[^'"`\r\n]*\1/g, '$1<path>$1')
      .replace(/file:\/\/\S+/gi, '<path>')
      .replace(/\b[a-zA-Z]:[\\/][^\s'"`<>|]*/g, '<path>')
      .replace(/\\\\[^\s'"`<>|]+/g, '<path>')
      .replace(/(^|[\s(=,:[])\/[^\s'"`<>|,;)\]]+/g, '$1<path>')
  );
}

function scrubValue(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return describeError(value);
  const text = redact(typeof value === 'string' ? value : safeJson(value));
  return text.length > MAX_FIELD ? `${text.slice(0, MAX_FIELD)}…` : text;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function describeError(err) {
  if (!(err instanceof Error)) return scrubValue(err);
  const code = typeof err.code === 'string' ? ` ${err.code}` : '';
  const message = redact(err.message || '').slice(0, MAX_FIELD);
  return `${err.name}${code}: ${message}`;
}

/** The short code an error may cross the IPC boundary with; anything else becomes "internal-error". */
function errorCode(err) {
  if (err instanceof Error && /^[a-z][a-z0-9-]{0,40}$/.test(err.message)) return err.message;
  return 'internal-error';
}

function format(level, event, fields) {
  const parts = [new Date().toISOString(), level, scrubValue(event)];
  if (fields && typeof fields === 'object' && !(fields instanceof Error)) {
    for (const [key, value] of Object.entries(fields)) parts.push(`${key}=${scrubValue(value)}`);
  } else if (fields !== undefined) {
    parts.push(scrubValue(fields));
  }
  return parts.join(' ');
}

function info(event, fields) {
  console.log(format('INFO', event, fields));
}

function warn(event, fields) {
  console.warn(format('WARN', event, fields));
}

function error(event, fields) {
  console.error(format('ERROR', event, fields));
}

module.exports = { info, warn, error, redact, errorCode, format };
