'use strict';
/**
 * Settings and session as JSON files in the userData directory
 * (settings.json, session.json). A missing or corrupt file yields the
 * defaults; only settings, workspace paths, tab paths and window geometry are
 * stored — never file contents or unsaved buffers (AC-15, AC-27).
 * Writes are atomic (temp file + rename). Errors are logged without paths.
 */
const fs = require('node:fs');
const path = require('node:path');

const CHANNELS = ['settings:load', 'settings:save', 'session:load', 'session:save', 'session:clearRecent'];

const SETTINGS_FILE = 'settings.json';
const SESSION_FILE = 'session.json';
const MAX_RECENT = 10;
const MAX_TABS = 50;
const MAX_PATH = 4096;

const DEFAULT_SETTINGS = Object.freeze({
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: false,
  lineNumbers: true,
  trimOnSave: false,
  finalNewlineOnSave: false,
  theme: 'system',
});

function defaultSession() {
  return {
    recentWorkspaces: [],
    lastWorkspace: null,
    openTabs: [],
    activeTab: null,
    sidebarWidth: 260,
    windowBounds: null,
  };
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isPath(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_PATH && !v.includes('\0');
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Keeps only known settings keys with valid values; the rest are defaults. */
function sanitizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (!isPlainObject(raw)) return out;
  if (typeof raw.fontFamily === 'string' && raw.fontFamily.length > 0 && raw.fontFamily.length <= 200) out.fontFamily = raw.fontFamily;
  if (isNum(raw.fontSize) && raw.fontSize >= 6 && raw.fontSize <= 72) out.fontSize = Math.round(raw.fontSize);
  if (isNum(raw.tabSize) && raw.tabSize >= 1 && raw.tabSize <= 16) out.tabSize = Math.round(raw.tabSize);
  for (const k of ['insertSpaces', 'wordWrap', 'lineNumbers', 'trimOnSave', 'finalNewlineOnSave']) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  if (raw.theme === 'system' || raw.theme === 'dark' || raw.theme === 'light') out.theme = raw.theme;
  return out;
}

function sanitizeBounds(b) {
  if (!isPlainObject(b) || ![b.x, b.y, b.width, b.height].every(isNum)) return null;
  const width = Math.round(b.width);
  const height = Math.round(b.height);
  if (width < 200 || height < 150 || width > 20000 || height > 20000) return null;
  return { x: Math.round(b.x), y: Math.round(b.y), width, height };
}

/** Keeps only paths, tab flags, sidebar width and bounds (mirrors src/core/session.ts). */
function sanitizeSession(raw) {
  const out = defaultSession();
  if (!isPlainObject(raw)) return out;
  if (Array.isArray(raw.recentWorkspaces)) {
    for (const p of raw.recentWorkspaces) {
      if (out.recentWorkspaces.length >= MAX_RECENT) break;
      if (isPath(p) && !out.recentWorkspaces.includes(p)) out.recentWorkspaces.push(p);
    }
  }
  if (isPath(raw.lastWorkspace)) out.lastWorkspace = raw.lastWorkspace;
  if (Array.isArray(raw.openTabs)) {
    for (const t of raw.openTabs) {
      if (out.openTabs.length >= MAX_TABS) break;
      if (!isPlainObject(t) || !isPath(t.path) || out.openTabs.some((o) => o.path === t.path)) continue;
      out.openTabs.push({ path: t.path, preview: t.preview === true });
    }
  }
  if (isPath(raw.activeTab) && out.openTabs.some((t) => t.path === raw.activeTab)) out.activeTab = raw.activeTab;
  if (isNum(raw.sidebarWidth)) out.sidebarWidth = Math.min(800, Math.max(160, Math.round(raw.sidebarWidth)));
  out.windowBounds = sanitizeBounds(raw.windowBounds);
  return out;
}

/** File store bound to one directory (userData in the app, a temp dir in tests). */
function createStore(dir, log) {
  const file = (name) => path.join(dir, name);

  function readJson(name) {
    let text;
    try {
      text = fs.readFileSync(file(name), 'utf8');
    } catch (err) {
      if (err && err.code !== 'ENOENT' && log) log.warn('persistence.read', { file: name, code: err.code || 'unknown' });
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      if (log) log.warn('persistence.corrupt', { file: name });
      return null;
    }
  }

  function writeJson(name, data) {
    const target = file(name);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, target);
    } catch (err) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* the temp file may not exist */
      }
      if (log) log.error('persistence.write', { file: name, code: (err && err.code) || 'unknown' });
      throw new Error('write-failed');
    }
  }

  return {
    loadSettings: () => sanitizeSettings(readJson(SETTINGS_FILE)),
    saveSettings: (s) => writeJson(SETTINGS_FILE, sanitizeSettings(s)),
    loadSession: () => sanitizeSession(readJson(SESSION_FILE)),
    saveSession: (s) => writeJson(SESSION_FILE, sanitizeSession(s)),
  };
}

let store = null;

/** The store of the running app (userData directory). */
function getStore(ctx) {
  if (!store) store = createStore(ctx.electron.app.getPath('userData'), ctx.log);
  return store;
}

/** true when `p` is exactly a root main itself allowed (Open Folder dialog or session:load). */
function isAllowedRoot(security, p) {
  if (!security || typeof security.canonicalize !== 'function' || !security.allowedRoots) return false;
  try {
    return security.allowedRoots.has(security.canonicalize(p));
  } catch {
    return false;
  }
}

/** @param ctx the handler context documented in electron/main.cjs */
function register(ctx) {
  const s = () => getStore(ctx);
  ctx.handle('settings:load', async () => s().loadSettings());
  ctx.handle('settings:save', async (settings) => {
    if (!isPlainObject(settings)) throw new Error('invalid-argument');
    s().saveSettings(settings);
  });
  ctx.handle('session:load', async () => {
    const session = s().loadSession();
    // session.json holds only workspace paths main vouched for (see session:save):
    // each was chosen by the user in a dialog, in this or an earlier run.
    if (session.lastWorkspace) {
      try {
        if (fs.statSync(session.lastWorkspace).isDirectory()) ctx.security.allowRoot(session.lastWorkspace);
        else session.lastWorkspace = null;
      } catch {
        session.lastWorkspace = null;
      }
    }
    // The welcome screen may reopen any recent workspace; a vanished folder stays forbidden.
    for (const p of session.recentWorkspaces) {
      if (p === session.lastWorkspace) continue;
      try {
        if (fs.statSync(p).isDirectory()) ctx.security.allowRoot(p);
      } catch {
        // missing folder: not allowed, opening it reports an error in the explorer
      }
    }
    return session;
  });
  ctx.handle('session:save', async (session) => {
    if (!isPlainObject(session)) throw new Error('invalid-argument');
    // Window geometry is owned by the main process (windowState.cjs).
    const current = s().loadSession();
    const incoming = sanitizeSession(session);
    // session:load grants access to the stored workspace paths, so only a path
    // main already vouched for may be stored: one already in the file, or a
    // root the user chose in this run (dialog or a granted recent workspace).
    const vouched = (p) =>
      p === current.lastWorkspace || current.recentWorkspaces.includes(p) || isAllowedRoot(ctx.security, p);
    s().saveSession({
      ...incoming,
      recentWorkspaces: incoming.recentWorkspaces.filter(vouched),
      lastWorkspace: incoming.lastWorkspace !== null && vouched(incoming.lastWorkspace) ? incoming.lastWorkspace : null,
      windowBounds: current.windowBounds,
    });
  });
  ctx.handle('session:clearRecent', async () => {
    const current = s().loadSession();
    s().saveSession({ ...current, recentWorkspaces: [], lastWorkspace: null, openTabs: [], activeTab: null });
  });
}

module.exports = { CHANNELS, DEFAULT_SETTINGS, register, getStore, createStore, sanitizeSettings, sanitizeSession };
