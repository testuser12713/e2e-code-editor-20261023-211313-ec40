import { describe, it, expect } from 'vitest';
import { detectLanguage } from './language';

describe('detectLanguage', () => {
  it.each([
    ['a.js', 'javascript'], ['a.jsx', 'javascript'], ['a.mjs', 'javascript'],
    ['a.ts', 'typescript'], ['a.tsx', 'typescript'],
    ['package.json', 'json'], ['index.html', 'html'], ['s.css', 'css'],
    ['README.md', 'markdown'], ['x.py', 'python'],
    ['m.c', 'cpp'], ['m.h', 'cpp'], ['m.cpp', 'cpp'], ['m.hpp', 'cpp'],
    ['A.java', 'java'], ['main.go', 'go'], ['lib.rs', 'rust'],
    ['notes.txt', 'plaintext'], ['Makefile', 'plaintext'], ['.gitignore', 'plaintext'], ['', 'plaintext'],
  ])('%s -> %s', (p, id) => expect(detectLanguage(p)).toBe(id));

  it('handles paths, case and dotted folders', () => {
    expect(detectLanguage('C:\\proj\\src\\App.TS')).toBe('typescript');
    expect(detectLanguage('/home/u/my.dir/file')).toBe('plaintext');
    expect(detectLanguage('/a/b.test.py')).toBe('python');
  });
});
