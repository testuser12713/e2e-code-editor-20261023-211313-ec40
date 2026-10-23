import { describe, it, expect } from 'vitest';
import { matchGlob } from './glob';

describe('matchGlob', () => {
  it('matches an extension at any depth', () => {
    expect(matchGlob('*.ts', 'index.ts')).toBe(true);
    expect(matchGlob('*.ts', 'src/api/cache.ts')).toBe(true);
    expect(matchGlob('*.ts', 'src/api/cache.tsx')).toBe(false);
  });

  it('matches a folder and everything below it', () => {
    expect(matchGlob('src/**', 'src/api/cache.ts')).toBe(true);
    expect(matchGlob('test', 'test/forecast.test.ts')).toBe(true);
    expect(matchGlob('test/', 'test/forecast.test.ts')).toBe(true);
    expect(matchGlob('test', 'src/test/a.ts')).toBe(true);
    expect(matchGlob('test', 'src/latest/a.ts')).toBe(false);
  });

  it('accepts comma separated lists', () => {
    expect(matchGlob('test/**, *.md', 'README.md')).toBe(true);
    expect(matchGlob('test/**, *.md', 'test/a.ts')).toBe(true);
    expect(matchGlob('test/**, *.md', 'src/a.ts')).toBe(false);
  });

  it('keeps * and ? inside one segment, ** crosses segments', () => {
    expect(matchGlob('src/*.ts', 'src/a.ts')).toBe(true);
    expect(matchGlob('/src/*.ts', 'src/api/a.ts')).toBe(false);
    expect(matchGlob('/src/**/*.ts', 'src/a.ts')).toBe(true);
    expect(matchGlob('/src/**/*.ts', 'src/api/deep/a.ts')).toBe(true);
    expect(matchGlob('?.md', 'a.md')).toBe(true);
    expect(matchGlob('?.md', 'ab.md')).toBe(false);
  });

  it('is case-insensitive and accepts backslash paths', () => {
    expect(matchGlob('*.MD', 'docs\\usage.md')).toBe(true);
    expect(matchGlob('docs/**', 'docs\\usage.md')).toBe(true);
  });

  it('escapes regex characters and matches nothing for an empty pattern', () => {
    expect(matchGlob('a+b.txt', 'a+b.txt')).toBe(true);
    expect(matchGlob('a+b.txt', 'aab.txt')).toBe(false);
    expect(matchGlob('', 'a.txt')).toBe(false);
    expect(matchGlob(' , ', 'a.txt')).toBe(false);
  });
});
