import { describe, expect, it } from 'vitest';
import { applyEol, detectEol, normalizeToLf } from './lineEndings';

describe('lineEndings', () => {
  it('detects the dominant ending', () => {
    expect(detectEol('a\r\nb\r\nc')).toBe('crlf');
    expect(detectEol('a\nb\nc')).toBe('lf');
    expect(detectEol('no newline')).toBe('lf');
    expect(detectEol('a\r\nb\nc\n')).toBe('lf');
  });
  it('normalizes CRLF and lone CR to LF', () => {
    expect(normalizeToLf('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });
  it('applies the ending', () => {
    expect(applyEol('a\nb\n', 'crlf')).toBe('a\r\nb\r\n');
    expect(applyEol('a\nb\n', 'lf')).toBe('a\nb\n');
    expect(applyEol('a\r\nb', 'crlf')).toBe('a\r\nb');
  });
  it('round-trips a CRLF file', () => {
    const disk = 'x\r\ny\r\n';
    expect(applyEol(normalizeToLf(disk), detectEol(disk))).toBe(disk);
  });
});
