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

const allowedRoots = new Set();
const allowedPaths = new Set();

/** Allows a workspace root chosen in the Open Folder dialog (and everything below it). */
function allowRoot(p) {
  if (typeof p === 'string' && p.length > 0) allowedRoots.add(p);
}

/** Allows one path chosen in an Open File / Save As dialog. */
function allowPath(p) {
  if (typeof p === 'string' && p.length > 0) allowedPaths.add(p);
}

/**
 * Throws Error('path-not-allowed') unless `p` lies inside an allowed root or
 * is an allowed path. Skeleton: fails closed for every path.
 */
function assertAllowedPath(p) {
  void p;
  throw new Error('path-not-allowed');
}

module.exports = {
  isSafeExternalUrl,
  isSameDocument,
  hardenWebContents,
  allowRoot,
  allowPath,
  assertAllowedPath,
  // exposed for the file-system IPC implementation
  allowedRoots,
  allowedPaths,
};
