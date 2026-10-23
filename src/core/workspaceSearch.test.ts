import { describe, it, expect } from 'vitest';
import { searchText, buildSearchRegExp, offsetOfLineColumn, PREVIEW_MAX } from './workspaceSearch';

const base = { caseSensitive: false, wholeWord: false, regex: false };

describe('searchText', () => {
  it('returns nothing for an empty query', () => {
    expect(searchText('abc', { ...base, query: '' })).toEqual([]);
  });

  it('finds every match with 1-based line, columns and the line as preview', () => {
    const text = 'const cache = 1;\nno hit here\r\ncacheGet(cache)';
    expect(searchText(text, { ...base, query: 'cache' })).toEqual([
      { line: 1, start: 6, end: 11, preview: 'const cache = 1;' },
      { line: 3, start: 0, end: 5, preview: 'cacheGet(cache)' },
      { line: 3, start: 9, end: 14, preview: 'cacheGet(cache)' },
    ]);
  });

  it('is case-insensitive unless caseSensitive', () => {
    expect(searchText('Cache cache', { ...base, query: 'cache' })).toHaveLength(2);
    const cs = searchText('Cache cache', { ...base, query: 'cache', caseSensitive: true });
    expect(cs.map((m) => m.start)).toEqual([6]);
  });

  it('matches whole words only when asked', () => {
    const text = 'cache cached precache cache.';
    expect(searchText(text, { ...base, query: 'cache' })).toHaveLength(4);
    expect(searchText(text, { ...base, query: 'cache', wholeWord: true }).map((m) => m.start)).toEqual([0, 22]);
  });

  it('treats the query literally unless regex', () => {
    expect(searchText('a.b axb', { ...base, query: 'a.b' }).map((m) => m.start)).toEqual([0]);
    expect(searchText('a.b axb', { ...base, query: 'a.b', regex: true }).map((m) => m.start)).toEqual([0, 4]);
    expect(searchText('f(x) [y]', { ...base, query: '(x) [' })).toHaveLength(1);
  });

  it('throws invalid-regex for a broken pattern', () => {
    expect(() => searchText('abc', { ...base, query: '(', regex: true })).toThrow('invalid-regex');
    expect(() => buildSearchRegExp({ ...base, query: '[', regex: true })).toThrow('invalid-regex');
  });

  it('skips empty matches without looping forever', () => {
    expect(searchText('abc\n\nx', { ...base, query: '^', regex: true })).toEqual([]);
    expect(searchText('aXa', { ...base, query: 'x*', regex: true }).map((m) => m.start)).toEqual([1]);
  });

  it('stops at maxMatches', () => {
    const text = 'a '.repeat(100);
    expect(searchText(text, { ...base, query: 'a', maxMatches: 7 })).toHaveLength(7);
    expect(searchText(text, { ...base, query: 'a', maxMatches: 0 })).toEqual([]);
  });

  it('cuts a very long preview but keeps the real columns', () => {
    const line = 'x'.repeat(PREVIEW_MAX + 50) + 'needle';
    const [m] = searchText(line, { ...base, query: 'needle' });
    expect(m.start).toBe(PREVIEW_MAX + 50);
    expect(m.preview.length).toBe(PREVIEW_MAX);
  });
});

describe('offsetOfLineColumn', () => {
  it('turns a line and column into a document offset', () => {
    const text = 'ab\ncdef\r\ng';
    expect(offsetOfLineColumn(text, 1, 1)).toBe(1);
    expect(offsetOfLineColumn(text, 2, 2)).toBe(5);
    expect(offsetOfLineColumn(text, 3, 0)).toBe(8);
  });

  it('clamps out-of-range values', () => {
    expect(offsetOfLineColumn('ab\ncd', 9, 99)).toBe(5);
    expect(offsetOfLineColumn('ab', 0, -3)).toBe(0);
  });
});
