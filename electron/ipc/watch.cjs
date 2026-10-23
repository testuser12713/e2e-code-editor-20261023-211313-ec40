'use strict';
/**
 * Disk watching of the open workspace: emits fs:onChange events
 * ({ type: 'add'|'change'|'unlink'|'addDir'|'unlinkDir', path }) to the
 * window via ctx.send, ignoring node_modules and .git.
 *
 * One recursive fs.watch on the workspace root. Raw events are collected per
 * path and flushed after a short debounce, then classified with a stat call:
 * an existing entry is add/addDir (rename events) or change (file content);
 * a missing one is unlink, or unlinkDir when it was known as a folder.
 * fs:watch replaces any previous watcher; fs:unwatch and dispose() close it.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const nodePath = require('node:path');

const CHANNELS = ['fs:watch', 'fs:unwatch'];

/** Event channel main → renderer. */
const CHANGE_EVENT = 'fs:onChange';

const IGNORED = new Set(['node_modules', '.git']);
const DEBOUNCE_MS = 120;
/** Upper bound of events sent per flush (a checkout or an unzip can touch thousands). */
const MAX_EVENTS_PER_FLUSH = 1000;
/** Upper bound of folders remembered for unlinkDir classification. */
const MAX_KNOWN_DIRS = 20000;

/** true when any segment of the root-relative path is an ignored folder. */
function isIgnored(relative) {
  return relative
    .split(/[\\/]+/)
    .some((seg) => IGNORED.has(seg.toLowerCase()));
}

/**
 * Creates a watcher for `root` that calls emit({type, path}) per change.
 * `deps` lets tests replace fs.watch / stat and the debounce.
 * Returns { close(), ready } — ready resolves once known folders are scanned.
 */
function createWorkspaceWatcher(root, emit, deps = {}) {
  const watchImpl = deps.watch || fs.watch;
  const statImpl = deps.stat || ((p) => fsp.stat(p));
  const readdirImpl = deps.readdir || ((p) => fsp.readdir(p, { withFileTypes: true }));
  const debounceMs = typeof deps.debounceMs === 'number' ? deps.debounceMs : DEBOUNCE_MS;
  const log = deps.log;

  const base = nodePath.resolve(root);
  const knownDirs = new Set();
  /** path → 'rename' | 'change' (rename wins: it says the entry appeared or vanished) */
  const pending = new Map();
  let timer = null;
  let closed = false;
  let flushing = Promise.resolve();

  const rememberDir = (p) => {
    if (knownDirs.size < MAX_KNOWN_DIRS) knownDirs.add(p);
  };

  async function scan(dir) {
    if (closed || knownDirs.size >= MAX_KNOWN_DIRS) return;
    let entries;
    try {
      entries = await readdirImpl(dir);
    } catch {
      return; // an unreadable folder is simply not remembered
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED.has(entry.name.toLowerCase())) continue;
      const child = nodePath.join(dir, entry.name);
      rememberDir(child);
      await scan(child);
    }
  }

  async function classify(fullPath, kind) {
    let st = null;
    try {
      st = await statImpl(fullPath);
    } catch {
      st = null;
    }
    if (!st) {
      const wasDir = knownDirs.has(fullPath);
      if (wasDir) {
        for (const d of [...knownDirs]) {
          if (d === fullPath || d.startsWith(fullPath + nodePath.sep)) knownDirs.delete(d);
        }
      }
      return { type: wasDir ? 'unlinkDir' : 'unlink', path: fullPath };
    }
    if (st.isDirectory()) {
      if (kind === 'change' && knownDirs.has(fullPath)) return null; // a folder's own mtime moved
      const isNew = !knownDirs.has(fullPath);
      rememberDir(fullPath);
      return isNew ? { type: 'addDir', path: fullPath } : null;
    }
    return { type: kind === 'rename' ? 'add' : 'change', path: fullPath };
  }

  async function flush() {
    timer = null;
    const batch = [...pending.entries()];
    pending.clear();
    let sent = 0;
    for (const [fullPath, kind] of batch) {
      if (closed) return;
      if (sent >= MAX_EVENTS_PER_FLUSH) {
        if (log) log.warn('watch.truncated', { dropped: batch.length - sent });
        return;
      }
      const event = await classify(fullPath, kind);
      if (event && !closed) {
        emit(event);
        sent += 1;
      }
    }
  }

  function onRaw(eventType, filename) {
    if (closed || filename === null || filename === undefined) return;
    const rel = String(filename);
    if (rel.length === 0 || isIgnored(rel)) return;
    const fullPath = nodePath.join(base, rel);
    const kind = eventType === 'rename' ? 'rename' : 'change';
    if (pending.get(fullPath) !== 'rename') pending.set(fullPath, kind);
    if (!timer) {
      timer = setTimeout(() => {
        flushing = flushing.then(flush).catch((err) => {
          if (log) log.error('watch.flush', { error: err });
        });
      }, debounceMs);
    }
  }

  const watcher = watchImpl(base, { recursive: true, persistent: false }, onRaw);
  watcher.on('error', (err) => {
    if (log) log.error('watch.failed', { error: err });
    close();
  });

  function close() {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    timer = null;
    pending.clear();
    knownDirs.clear();
    try {
      watcher.close();
    } catch {
      // already closed by the OS
    }
  }

  const ready = scan(base);
  return { close, ready, get closed() { return closed; } };
}

let current = null;

/** Stops every watcher (called when the window closes and by fs:unwatch). */
function dispose() {
  if (current) {
    current.close();
    current = null;
  }
}

/**
 * @param ctx the handler context documented in electron/main.cjs
 * @param deps optional fs.watch / stat replacements (tests)
 */
function register(ctx, deps = {}) {
  const { security, validate, log } = ctx;

  ctx.handle('fs:watch', async (root) => {
    const real = security.assertAllowedPath(validate.assertPath(root));
    let st;
    try {
      st = await fsp.stat(real);
    } catch {
      throw new Error('not-found');
    }
    if (!st.isDirectory()) throw new Error('not-a-directory');
    dispose();
    // Events carry the spelling the renderer knows the workspace by.
    const shown = nodePath.resolve(root);
    try {
      current = createWorkspaceWatcher(real, (e) => {
        const rel = nodePath.relative(real, e.path);
        ctx.send(CHANGE_EVENT, { type: e.type, path: rel ? nodePath.join(shown, rel) : shown });
      }, { ...deps, log });
    } catch (err) {
      current = null;
      if (log) log.error('watch.start', { error: err });
      throw new Error('watch-failed');
    }
  });

  ctx.handle('fs:unwatch', async () => {
    dispose();
  });
}

module.exports = { CHANNELS, CHANGE_EVENT, register, dispose, createWorkspaceWatcher, isIgnored };
