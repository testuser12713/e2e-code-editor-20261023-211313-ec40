/**
 * Minimal glob matching for the workspace search include/exclude fields
 * (e.g. "src/**", "*.ts", comma separated lists).
 *
 * Rules (the same as electron/ipc/search-worker.cjs, which carries a CommonJS
 * copy for the main process):
 * - `pattern` may hold several globs separated by commas; any one matching is enough.
 * - `**` matches any number of characters including `/`; `*` and `?` stay
 *   within one path segment.
 * - A glob without a leading `/` may match at any folder depth, and a glob
 *   naming a folder also matches everything below it ("test" matches
 *   "test/a.ts" and "src/test/b.ts").
 * - Matching is case-insensitive (Windows file systems) and `\` in the path
 *   counts as `/`.
 * - An empty pattern (or one holding only commas/spaces) matches nothing.
 */
export function matchGlob(pattern: string, path: string): boolean {
  if (typeof pattern !== 'string' || typeof path !== 'string') return false;
  const target = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return compileGlobs(pattern).some((re) => re.test(target));
}

const cache = new Map<string, RegExp[]>();

/** Splits a comma list and compiles every glob once (small cache, patterns repeat per file). */
export function compileGlobs(pattern: string): RegExp[] {
  const hit = cache.get(pattern);
  if (hit) return hit;
  const list = pattern
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g.length > 0)
    .map(globToRegExp);
  if (cache.size > 100) cache.clear();
  cache.set(pattern, list);
  return list;
}

/** One glob (no commas) to an anchored, case-insensitive RegExp. */
export function globToRegExp(glob: string): RegExp {
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
        // "**/" may also match nothing at all
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
