import { describe, expect, it } from 'vitest';
import { baseName, isAbsolutePath, isSameOrInside, joinPath, parentPath, selectionEnd, validateName } from './fileNames';

describe('validateName', () => {
  it('accepts ordinary names', () => {
    expect(validateName('notes.md')).toBeNull();
    expect(validateName('.gitignore')).toBeNull();
    expect(validateName('my folder')).toBeNull();
  });

  it('rejects empty and whitespace-only names', () => {
    expect(validateName('')).toMatch(/must be provided/);
    expect(validateName('   ')).toMatch(/must be provided/);
  });

  it('rejects characters Windows forbids and control characters', () => {
    for (const bad of ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'a\u0001b']) {
      expect(validateName(bad)).toMatch(/cannot contain/);
    }
  });

  it('rejects dot names, trailing dots and spaces, reserved device names and over-long names', () => {
    expect(validateName('.')).not.toBeNull();
    expect(validateName('..')).not.toBeNull();
    expect(validateName('file.')).toMatch(/period or a space/);
    expect(validateName('file ')).toMatch(/period or a space/);
    expect(validateName('CON')).toMatch(/reserved/);
    expect(validateName('nul.txt')).toMatch(/reserved/);
    expect(validateName('com1')).toMatch(/reserved/);
    expect(validateName('console.log')).toBeNull();
    expect(validateName('a'.repeat(256))).toMatch(/at most/);
  });

  it('rejects a name that already exists, case-insensitively, except the entry itself', () => {
    expect(validateName('README.md', ['readme.md'])).toMatch(/already exists/);
    expect(validateName('Readme.md', ['README.md'], 'README.md')).toBeNull();
    expect(validateName('other.md', ['README.md'], 'README.md')).toBeNull();
  });
});

describe('path helpers', () => {
  it('joins with the folder separator', () => {
    expect(joinPath('C:\\ws', 'a.ts')).toBe('C:\\ws\\a.ts');
    expect(joinPath('C:\\', 'a.ts')).toBe('C:\\a.ts');
    expect(joinPath('/home/u/ws', 'src/a.ts')).toBe('/home/u/ws/src/a.ts');
    expect(joinPath('C:\\ws', 'src/a.ts')).toBe('C:\\ws\\src\\a.ts');
  });

  it('splits base name and parent', () => {
    expect(baseName('C:\\ws\\src\\a.ts')).toBe('a.ts');
    expect(baseName('/ws/src/')).toBe('src');
    expect(parentPath('C:\\ws\\src\\a.ts')).toBe('C:\\ws\\src');
    expect(parentPath('C:\\a.ts')).toBe('C:\\');
    expect(parentPath('/ws/a.ts')).toBe('/ws');
  });

  it('recognises absolute paths and containment', () => {
    expect(isAbsolutePath('C:\\ws')).toBe(true);
    expect(isAbsolutePath('/ws')).toBe(true);
    expect(isAbsolutePath('src\\a.ts')).toBe(false);
    expect(isSameOrInside('C:\\WS\\src\\a.ts', 'c:\\ws\\src')).toBe(true);
    expect(isSameOrInside('C:\\ws\\src', 'C:\\ws\\src')).toBe(true);
    expect(isSameOrInside('C:\\ws\\srcx', 'C:\\ws\\src')).toBe(false);
  });

  it('preselects the name without its extension', () => {
    expect(selectionEnd('forecast.ts')).toBe(8);
    expect(selectionEnd('.gitignore')).toBe(10);
    expect(selectionEnd('Makefile')).toBe(8);
  });
});
