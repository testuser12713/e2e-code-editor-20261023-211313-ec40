'use strict';
/**
 * File-system IPC: dialogs, directory listing, read/write, create, rename,
 * trash, reveal, stat. Every argument goes through validate.cjs, every path
 * through security.assertAllowedPath (which resolves `..` and symlinks), and
 * every failure leaves as a short code — never a path or file content.
 */

const fsp = require('node:fs/promises');
const nodePath = require('node:path');

const CHANNELS = [
  'fs:openFolderDialog',
  'fs:openFileDialog',
  'fs:saveAsDialog',
  'fs:readDir',
  'fs:listFiles',
  'fs:readFile',
  'fs:writeFile',
  'fs:createFile',
  'fs:createDir',
  'fs:rename',
  'fs:trash',
  'fs:reveal',
  'fs:stat',
];

const MAX_READ = 5 * 1024 * 1024;
const IGNORED = new Set(['node_modules', '.git']);
const MAX_LIST = 200000;

const CODE_MAP = {
  ENOENT: 'not-found',
  ENOTDIR: 'not-a-directory',
  EISDIR: 'is-a-directory',
  EEXIST: 'already-exists',
  EACCES: 'access-denied',
  EPERM: 'access-denied',
  EBUSY: 'busy',
  ENOTEMPTY: 'not-empty',
  EXDEV: 'cross-device',
  ENOSPC: 'no-space',
  EROFS: 'read-only',
  ENAMETOOLONG: 'name-too-long',
};

/** Turns any error into a short code Error (no paths, no contents). */
function toCodeError(err) {
  if (err && typeof err.code === 'string' && CODE_MAP[err.code]) return new Error(CODE_MAP[err.code]);
  if (err instanceof Error && /^[a-z][a-z0-9-]{0,40}$/.test(err.message)) return err;
  return new Error('io-error');
}

async function guarded(fn) {
  try {
    return await fn();
  } catch (err) {
    throw toCodeError(err);
  }
}

function detectEol(text) {
  const crlf = text.indexOf('\r\n');
  if (crlf === -1) return 'lf';
  const lf = text.indexOf('\n');
  return lf === crlf + 1 ? 'crlf' : 'lf';
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    const x = a.name.toLowerCase();
    const y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

function makeApi({ security, validate }) {
  const check = (p) => security.assertAllowedPath(validate.assertPath(p));

  async function readDir(dir) {
    const real = check(dir);
    return guarded(async () => {
      const dirents = await fsp.readdir(real, { withFileTypes: true });
      const out = [];
      for (const d of dirents) {
        if (IGNORED.has(d.name)) continue;
        const full = nodePath.join(real, d.name);
        let isDir = d.isDirectory();
        if (d.isSymbolicLink()) {
          try {
            isDir = (await fsp.stat(full)).isDirectory();
          } catch {
            continue; // dangling link
          }
        }
        out.push({ name: d.name, path: full, isDir });
      }
      return sortEntries(out);
    });
  }

  async function listFiles(root) {
    const real = check(root);
    return guarded(async () => {
      const files = [];
      const stack = [real];
      while (stack.length > 0 && files.length < MAX_LIST) {
        const dir = stack.pop();
        let dirents;
        try {
          dirents = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
          continue; // unreadable subfolder: skip it, keep walking
        }
        for (const d of dirents) {
          if (IGNORED.has(d.name)) continue;
          const full = nodePath.join(dir, d.name);
          if (d.isDirectory()) stack.push(full); // symlinked dirs are not followed
          else if (d.isFile()) files.push(full);
        }
      }
      return files.sort();
    });
  }

  async function readFile(p) {
    const real = check(p);
    return guarded(async () => {
      const st = await fsp.stat(real);
      if (st.isDirectory()) throw new Error('is-a-directory');
      if (st.size > MAX_READ) return { content: '', eol: 'lf', size: st.size, tooLarge: true };
      let content = await fsp.readFile(real, 'utf8');
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
      return { content, eol: detectEol(content), size: st.size, tooLarge: false };
    });
  }

  async function writeFile(p, content) {
    validate.assertContent(content);
    const real = check(p);
    return guarded(async () => {
      await fsp.writeFile(real, content, 'utf8');
    });
  }

  async function createFile(p) {
    const real = check(p);
    return guarded(async () => {
      await fsp.writeFile(real, '', { encoding: 'utf8', flag: 'wx' });
    });
  }

  async function createDir(p) {
    const real = check(p);
    return guarded(async () => {
      await fsp.mkdir(real);
    });
  }

  async function rename(from, to) {
    const a = check(from);
    const b = check(to);
    return guarded(async () => {
      let exists = true;
      try {
        await fsp.lstat(b);
      } catch {
        exists = false;
      }
      // a case-only rename on Windows resolves to the same file
      if (exists && !(process.platform === 'win32' && a.toLowerCase() === b.toLowerCase())) throw new Error('already-exists');
      await fsp.rename(a, b);
    });
  }

  async function stat(p) {
    const real = check(p);
    return guarded(async () => {
      const st = await fsp.stat(real);
      return { size: st.size, mtimeMs: st.mtimeMs, isDir: st.isDirectory() };
    });
  }

  return { readDir, listFiles, readFile, writeFile, createFile, createDir, rename, stat, check };
}

/** @param ctx the handler context documented in electron/main.cjs */
function register(ctx) {
  const { security, validate } = ctx;
  const { dialog, shell } = ctx.electron;
  const api = makeApi({ security, validate });
  const win = () => ctx.getWindow() || undefined;

  const showOpen = (opts) => (win() ? dialog.showOpenDialog(win(), opts) : dialog.showOpenDialog(opts));

  ctx.handle('fs:openFolderDialog', async () => {
    const r = await showOpen({ properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths || r.filePaths.length === 0) return null;
    const chosen = r.filePaths[0];
    security.allowRoot(chosen);
    return chosen;
  });

  ctx.handle('fs:openFileDialog', async () => {
    const r = await showOpen({ properties: ['openFile'] });
    if (r.canceled || !r.filePaths || r.filePaths.length === 0) return null;
    const chosen = r.filePaths[0];
    security.allowPath(chosen);
    return chosen;
  });

  ctx.handle('fs:saveAsDialog', async (defaultPath) => {
    const def = validate.assertOptionalPath(defaultPath);
    const opts = def ? { defaultPath: def } : {};
    const r = win() ? await dialog.showSaveDialog(win(), opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    security.allowPath(r.filePath);
    return r.filePath;
  });

  ctx.handle('fs:readDir', (p) => api.readDir(p));
  ctx.handle('fs:listFiles', (p) => api.listFiles(p));
  ctx.handle('fs:readFile', (p) => api.readFile(p));
  ctx.handle('fs:writeFile', (p, c) => api.writeFile(p, c));
  ctx.handle('fs:createFile', (p) => api.createFile(p));
  ctx.handle('fs:createDir', (p) => api.createDir(p));
  ctx.handle('fs:rename', (a, b) => api.rename(a, b));
  ctx.handle('fs:trash', async (p) => {
    const real = api.check(p);
    await guarded(() => shell.trashItem(real));
  });
  ctx.handle('fs:reveal', async (p) => {
    const real = api.check(p);
    shell.showItemInFolder(real);
  });
  ctx.handle('fs:stat', (p) => api.stat(p));
}

module.exports = { CHANNELS, register, makeApi, detectEol, toCodeError, MAX_READ };
