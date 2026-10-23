'use strict';
/**
 * Security boundary of the main process.
 *
 * 1. Window hardening (AC-23): no navigation away from the app, no new
 *    windows, no <webview>; external links leave ONLY through
 *    shell.openExternal and ONLY for https: URLs.
 * 2. Path allow-list (AC-21): file-system IPC may touch only the chosen
 *    workspace folder or a path picked in a dialog. The skeleton keeps the
 *    final API and FAILS CLOSED; "Implement secure main-process file system
 *    IPC" fills in the normalisation (.., symlinks) and the checks.
 *
 * Nothing here requires 'electron', so it can be unit-tested directly.
 */

const MAX_URL = 2048;

/** true only for well-formed https: URLs. */
function isSafeExternalUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0 && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/** true when `target` is the page the window already shows (same document, any hash). */
function isSameDocument(target, current) {
  try {
    const a = new URL(target);
    const b = new URL(current);
    a.hash = '';
    b.hash = '';
    return a.href === b.href;
  } catch {
    return false;
  }
}

/**
 * Applies the navigation rules to a webContents.
 * @param contents   Electron WebContents (or a compatible fake in tests)
 * @param openExternal  (url) => Promise — shell.openExternal
 */
function hardenWebContents(contents, openExternal) {
  const openSafely = (url) => {
    if (!isSafeExternalUrl(url)) return;
    Promise.resolve()
      .then(() => openExternal(url))
      .catch(() => {
        // The OS refused to open the link; there is nothing to report but the fact.
        console.warn('[security] external link could not be opened');
      });
  };

  contents.on('will-navigate', (event, legacyUrl) => {
    const url = event && typeof event.url === 'string' ? event.url : legacyUrl;
    if (typeof url === 'string' && isSameDocument(url, contents.getURL())) return;
    event.preventDefault();
    openSafely(url);
  });

  contents.on('will-redirect', (event, legacyUrl) => {
    const url = event && typeof event.url === 'string' ? event.url : legacyUrl;
    if (typeof url === 'string' && isSameDocument(url, contents.getURL())) return;
    event.preventDefault();
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  contents.setWindowOpenHandler(({ url }) => {
    openSafely(url);
    return { action: 'deny' };
  });
}

/* ---------- path allow-list (filled by the file-system IPC ticket) ---------- */

const fs = require('node:fs');
const nodePath = require('node:path');

const allowedRoots = new Set();
const allowedPaths = new Set();

const IS_WIN = process.platform === 'win32';

function cmpKey(p) {
  return IS_WIN ? p.toLowerCase() : p;
}

/**
 * Absolute, normalised path with every symlink of its EXISTING part resolved
 * (realpath of the deepest existing ancestor, the not-yet-existing rest
 * appended). Throws Error('invalid-path') for non-strings and NUL bytes.
 */
function canonicalize(p) {
  if (typeof p !== 'string' || p.length === 0 || p.includes('\0')) throw new Error('invalid-path');
  let current = nodePath.resolve(p);
  const rest = [];
  for (;;) {
    try {
      const real = fs.realpathSync.native(current);
      return rest.length ? nodePath.join(real, ...rest.reverse()) : real;
    } catch (err) {
      const parent = nodePath.dirname(current);
      if (parent === current || (err && err.code !== 'ENOENT' && err.code !== 'ENOTDIR')) {
        throw new Error('invalid-path');
      }
      rest.push(nodePath.basename(current));
      current = parent;
    }
  }
}

function isInside(child, root) {
  const c = cmpKey(child);
  const r = cmpKey(root);
  if (c === r) return true;
  const rel = nodePath.relative(r, c);
  return rel.length > 0 && !rel.startsWith('..') && !nodePath.isAbsolute(rel);
}

/** Allows a workspace root chosen in the Open Folder dialog (and everything below it). */
function allowRoot(p) {
  if (typeof p !== 'string' || p.length === 0) return;
  try {
    allowedRoots.add(canonicalize(p));
  } catch {
    // an unusable path simply stays not allowed
  }
}

/** Allows one path chosen in an Open File / Save As dialog. */
function allowPath(p) {
  if (typeof p !== 'string' || p.length === 0) return;
  try {
    allowedPaths.add(cmpKey(canonicalize(p)));
  } catch {
    // an unusable path simply stays not allowed
  }
}

/**
 * Throws Error('path-not-allowed') unless `p` — after resolving `..` and
 * symlinks — lies inside an allowed root or is an allowed path.
 * Returns the canonical path the caller must use for the actual access.
 */
function assertAllowedPath(p) {
  let real;
  try {
    real = canonicalize(p);
  } catch {
    throw new Error('path-not-allowed');
  }
  if (allowedPaths.has(cmpKey(real))) return real;
  for (const root of allowedRoots) {
    if (isInside(real, root)) return real;
  }
  throw new Error('path-not-allowed');
}

/** Test helper: forgets every allowed root and path. */
function resetAllowed() {
  allowedRoots.clear();
  allowedPaths.clear();
}

module.exports = {
  isSafeExternalUrl,
  isSameDocument,
  hardenWebContents,
  allowRoot,
  allowPath,
  assertAllowedPath,
  canonicalize,
  isInside,
  resetAllowed,
  // exposed for the file-system IPC implementation
  allowedRoots,
  allowedPaths,
};
