import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../platform';
import { createAppStore } from './AppStore';
import { detectIndent, docFromRead, openFile, takeReveal } from './openFile';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('docFromRead', () => {
  it('normalizes CRLF to LF and keeps the eol of the file', () => {
    const doc = docFromRead('C:\\w\\a.ts', { content: 'a\r\nb\r\n', eol: 'crlf', size: 6, tooLarge: false }, { useTabs: false, size: 2 });
    expect(doc.text).toBe('a\nb\n');
    expect(doc.savedText).toBe(doc.text);
    expect(doc.eol).toBe('crlf');
    expect(doc.language).toBe('typescript');
    expect(doc.readOnly).toBe(false);
    expect(doc.tooLarge).toBe(false);
  });

  it('makes a file over 5 MB read-only without content', () => {
    const doc = docFromRead('C:\\w\\big.json', { content: '', eol: 'lf', size: 12_000_000, tooLarge: true }, { useTabs: false, size: 2 });
    expect(doc).toMatchObject({ text: '', readOnly: true, tooLarge: true, language: 'json' });
  });
});

describe('detectIndent', () => {
  const fallback = { useTabs: false, size: 2 };
  it('detects tabs', () => {
    expect(detectIndent('a\n\tb\n\tc\n', fallback)).toEqual({ useTabs: true, size: 2 });
  });
  it('detects four spaces', () => {
    expect(detectIndent('a {\n    b\n        c\n    d\n}\n', fallback)).toEqual({ useTabs: false, size: 4 });
  });
  it('falls back without indented lines', () => {
    expect(detectIndent('a\nb\n', { useTabs: true, size: 8 })).toEqual({ useTabs: true, size: 8 });
  });
});

describe('openFile', () => {
  const file = 'C:\\w\\src\\main.py';

  it('reads the file, opens a preview tab and makes it active', async () => {
    const read = vi.spyOn(api.fs, 'readFile').mockResolvedValue({ content: 'x = 1\n', eol: 'lf', size: 6, tooLarge: false });
    const store = createAppStore();
    await openFile(file, { preview: true }, store);
    const s = store.getState();
    expect(read).toHaveBeenCalledWith(file);
    expect(s.tabs).toEqual([{ path: file, preview: true }]);
    expect(s.activeTab).toBe(file);
    expect(s.docs[file]).toMatchObject({ text: 'x = 1\n', language: 'python', eol: 'lf' });
  });

  it('does not read an open file again and pins it when opened permanently', async () => {
    const read = vi.spyOn(api.fs, 'readFile').mockResolvedValue({ content: 'x\n', eol: 'lf', size: 2, tooLarge: false });
    const store = createAppStore();
    await openFile(file, { preview: true }, store);
    await openFile(file, {}, store);
    expect(read).toHaveBeenCalledTimes(1);
    expect(store.getState().tabs).toEqual([{ path: file, preview: false }]);
  });

  it('queues a reveal request for the editor', async () => {
    vi.spyOn(api.fs, 'readFile').mockResolvedValue({ content: 'a\nb\nc\n', eol: 'lf', size: 6, tooLarge: false });
    const store = createAppStore();
    await openFile(file, { line: 3 }, store);
    expect(takeReveal(file)).toEqual({ line: 3, selectFrom: undefined, selectTo: undefined });
    expect(takeReveal(file)).toBeUndefined();
  });

  it('rejects without opening a tab when the file cannot be read', async () => {
    vi.spyOn(api.fs, 'readFile').mockRejectedValue(new Error('not-found'));
    const store = createAppStore();
    await expect(openFile(file, {}, store)).rejects.toThrow('not-found');
    expect(store.getState().tabs).toEqual([]);
  });
});
