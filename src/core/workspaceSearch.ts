import { LIMITS, type SearchMatch } from '../types';

export interface SearchTextOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  /** Stop after this many matches (defaults to LIMITS.maxSearchMatches). */
  maxMatches?: number;
}

/**
 * Longest preview sent per match. `start`/`end` are columns of the whole
 * line, so a match beyond this column is still listed and selectable, only
 * its preview cannot highlight it. (Same value in search-worker.cjs.)
 */
export const PREVIEW_MAX = 1000;

/**
 * Builds the RegExp of a search: the query escaped unless `regex`, wrapped in
 * word boundaries for `wholeWord`, global and case-insensitive unless
 * `caseSensitive`. Throws Error("invalid-regex") for an invalid pattern.
 */
export function buildSearchRegExp(opts: Pick<SearchTextOptions, 'query' | 'caseSensitive' | 'wholeWord' | 'regex'>): RegExp {
  let src = opts.regex ? opts.query : opts.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (opts.wholeWord) src = `\\b(?:${src})\\b`;
  try {
    return new RegExp(src, opts.caseSensitive ? 'g' : 'gi');
  } catch {
    throw new Error('invalid-regex');
  }
}

/**
 * Finds every match of the query in one file's content. Used by the browser
 * fallback (src/platform/demoFs.ts); the main process has its own worker.
 * An invalid regular expression throws an Error with message "invalid-regex".
 *
 * Each match: `line` 1-based, `start`/`end` 0-based UTF-16 columns of that
 * line (end exclusive), `preview` the line's text (cut at PREVIEW_MAX).
 * Lines end at LF, CRLF or CR; empty matches are skipped.
 */
export function searchText(content: string, opts: SearchTextOptions): SearchMatch[] {
  const out: SearchMatch[] = [];
  if (typeof content !== 'string' || !opts || typeof opts.query !== 'string' || opts.query.length === 0) return out;
  const re = buildSearchRegExp(opts);
  const max = opts.maxMatches ?? LIMITS.maxSearchMatches;
  if (!(max > 0)) return out;
  const lines = content.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    let preview: string | null = null;
    for (const m of text.matchAll(re)) {
      if (m[0].length === 0) continue;
      const start = m.index ?? 0;
      if (preview === null) preview = text.length > PREVIEW_MAX ? text.slice(0, PREVIEW_MAX) : text;
      out.push({ line: i + 1, start, end: start + m[0].length, preview });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * Document offset of (line, column) in `text` — lines end at LF, CRLF or CR,
 * offsets count the text as the editor holds it (LF only). Out-of-range
 * values are clamped to the text.
 */
export function offsetOfLineColumn(text: string, line: number, column: number): number {
  const lines = text.split(/\r\n|\n|\r/);
  const l = Math.min(Math.max(1, Math.floor(line) || 1), lines.length);
  let offset = 0;
  for (let i = 0; i < l - 1; i++) offset += lines[i].length + 1;
  return offset + Math.min(Math.max(0, Math.floor(column) || 0), lines[l - 1].length);
}
