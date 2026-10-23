'use strict';
/**
 * Worker thread of the workspace search (started by search.cjs with the
 * validated SearchRequest as workerData). Walks the workspace asynchronously
 * — skipping node_modules, .git, symlinked folders, binaries and files above
 * 5 MB — honours the include/exclude globs and posts back:
 *   { type: 'file', file: { path, matches } }   per file with matches
 *   { type: 'done', truncated }                 when the walk is complete
 *   { type: 'error', error }                    short code ('invalid-regex', …)
 * A pathological regex can only block THIS thread; the main process
 * terminates it on timeout or cancel.
 *
 * The matching rules are the CommonJS twin of src/core/workspaceSearch.ts and
 * src/core/glob.ts (the renderer's browser fallback): keep both in step.
 */
const fsp = require('node:fs/promises');
const nodePath = require('node:path');

const IGNORED = new Set(['node_modules', '.git']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_MAX = 1000;
const BINARY_SNIFF = 8000;

function buildSearchRegExp(opts) {
  let src = opts.regex ? opts.query : opts.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (opts.wholeWord) src = `\\b(?:${src})\\b`;
  try {
    return new RegExp(src, opts.caseSensitive ? 'g' : 'gi');
  } catch {
    throw new Error('invalid-regex');
  }
}

/** Matches of one file's text; same shape and rules as searchText() in the renderer. */
function searchText(content, opts, re, max) {
  const out = [];
  if (!(max > 0)) return out;
  const lines = content.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    let preview = null;
    for (const m of text.matchAll(re)) {
      if (m[0].length === 0) continue;
      if (preview === null) preview = text.length > PREVIEW_MAX ? text.slice(0, PREVIEW_MAX) : text;
      out.push({ line: i + 1, start: m.index, end: m.index + m[0].length, preview });
      if (out.length >= max) return out;
    }
  }
  return out;
}

function globToRegExp(glob) {
  let g = glob.replace(/\\/g, '/').trim();
  let anchored = false;
  if (g.startsWith('./')) {
    g = g.slice(2);
    anchored = true;
  } else if (g.startsWith('/')) {
    g = g.replace(/^\/+/, '');
    anchored = true;
  }
  g = g.replace(/\/+$/, '');
  let src = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') {
          src += '(?:.*/)?';
          i += 2;
        } else {
          src += '.*';
          i += 1;
        }
      } else {
        src += '[^/]*';
      }
    } else if (c === '?') {
      src += '[^/]';
    } else {
      src += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${anchored ? '^' : '(?:^|/)'}${src}(?:$|/)`, 'i');
}

/** Comma separated glob list → matcher; an empty list matches nothing. */
function compileGlobs(pattern) {
  const list = String(pattern || '')
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g.length > 0)
    .map(globToRegExp);
  return (rel) => list.some((re) => re.test(rel));
}

function matchGlob(pattern, path) {
  return compileGlobs(pattern)(String(path).replace(/\\/g, '/').replace(/^\.\//, ''));
}

function isBinary(buf) {
  const n = Math.min(buf.length, BINARY_SNIFF);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/**
 * Runs one search and reports through `post`. Resolves when done.
 * @param req  validated SearchRequest plus optional maxMatches
 * @param post (message) => void
 */
async function runSearch(req, post) {
  let re;
  try {
    re = buildSearchRegExp(req);
  } catch {
    post({ type: 'error', error: 'invalid-regex' });
    return;
  }
  const maxMatches = req.maxMatches > 0 ? req.maxMatches : 5000;
  const include = req.include && req.include.trim() ? compileGlobs(req.include) : null;
  const exclude = req.exclude && req.exclude.trim() ? compileGlobs(req.exclude) : null;
  const root = req.root;

  try {
    const st = await fsp.stat(root);
    if (!st.isDirectory()) throw new Error('not-a-directory');
  } catch {
    post({ type: 'error', error: 'not-a-directory' });
    return;
  }

  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let dirents;
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable folder: keep walking the rest
    }
    dirents.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)); // popped in alphabetical order
    const files = [];
    for (const d of dirents) {
      if (IGNORED.has(d.name)) continue;
      const full = nodePath.join(dir, d.name);
      if (d.isDirectory()) stack.push(full);
      else if (d.isFile()) files.push(full);
    }
    files.reverse();
    for (const full of files) {
      const rel = nodePath.relative(root, full).replace(/\\/g, '/');
      if (include && !include(rel)) continue;
      if (exclude && exclude(rel)) continue;
      let buf;
      try {
        const st = await fsp.stat(full);
        if (st.size > MAX_FILE_BYTES) continue;
        buf = await fsp.readFile(full);
      } catch {
        continue; // vanished or locked: skip it
      }
      if (isBinary(buf)) continue;
      let text = buf.toString('utf8');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      const matches = searchText(text, req, re, maxMatches - total);
      if (matches.length === 0) continue;
      total += matches.length;
      post({ type: 'file', file: { path: full, matches } });
      if (total >= maxMatches) {
        post({ type: 'done', truncated: true });
        return;
      }
    }
  }
  post({ type: 'done', truncated: false });
}

// Runs as a worker thread: the request arrives as workerData.
let wt = null;
try {
  wt = require('node:worker_threads');
} catch {
  wt = null;
}
if (wt && !wt.isMainThread && wt.parentPort && wt.workerData && wt.workerData.kind === 'workspace-search') {
  const port = wt.parentPort;
  runSearch(wt.workerData.request, (msg) => port.postMessage(msg)).catch(() => port.postMessage({ type: 'error', error: 'search-failed' }));
}

module.exports = { runSearch, searchText, buildSearchRegExp, matchGlob, compileGlobs, isBinary, MAX_FILE_BYTES, PREVIEW_MAX };
