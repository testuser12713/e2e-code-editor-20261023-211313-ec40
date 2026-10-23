import { describe, expect, it } from 'vitest';
import { transformForSave } from './saveTransform';

describe('transformForSave', () => {
  it('changes nothing when both options are off', () => {
    expect(transformForSave('a  \nb\t', { trimOnSave: false, finalNewlineOnSave: false })).toBe('a  \nb\t');
  });
  it('trims trailing whitespace when enabled', () => {
    expect(transformForSave('a  \n b\t\n', { trimOnSave: true, finalNewlineOnSave: false })).toBe('a\n b\n');
  });
  it('adds a final newline when enabled, once', () => {
    expect(transformForSave('a', { trimOnSave: false, finalNewlineOnSave: true })).toBe('a\n');
    expect(transformForSave('a\n', { trimOnSave: false, finalNewlineOnSave: true })).toBe('a\n');
    expect(transformForSave('', { trimOnSave: false, finalNewlineOnSave: true })).toBe('');
  });
});
