import { describe, expect, it, vi } from 'vitest';
import { createAppStore, createInitialState } from './AppStore';
import { applyExternalChange, decideExternalChange, keepMine, reloadFromDisk, startExternalChanges } from './externalChanges';
import type { Doc, FsChangeEvent, ReadFileResult } from '../types';

const PATH = 'C:\\w\\a.ts';

function makeDoc(patch: Partial<Doc> = {}): Doc {
  return {
    path: PATH,
    text: 'one\n',
    savedText: 'one\n',
    eol: 'lf',
    language: 'typescript',
    indent: { useTabs: false, size: 2 },
    readOnly: false,
    tooLarge: false,
    conflict: false,
    ...patch,
  };
}

function setup(doc: Doc, disk: Partial<ReadFileResult> | Error, workspace: string | null = 'C:\\w') {
  const store = createAppStore(
    createInitialState({ workspace, tabs: [{ path: PATH, preview: false }], activeTab: PATH, docs: { [PATH]: doc } }),
  );
  let emit: (e: FsChangeEvent) => void = () => undefined;
  const fs = {
    readFile: vi.fn(async () => {
      if (disk instanceof Error) throw disk;
      return { content: '', eol: 'lf' as const, size: 0, tooLarge: false, ...disk };
    }),
    watch: vi.fn(async () => undefined),
    unwatch: vi.fn(async () => undefined),
    onChange: vi.fn((cb: (e: FsChangeEvent) => void) => {
      emit = cb;
      return () => {
        emit = () => undefined;
      };
    }),
  };
  const deps = { store, api: { fs } as never };
  return { store, fs, deps, emit: (e: FsChangeEvent) => emit(e) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('decideExternalChange', () => {
  it('ignores a disk version equal to what was last saved (our own save)', () => {
    expect(decideExternalChange({ text: 'mine', savedText: 'disk' }, 'disk')).toBe('ignore');
    expect(decideExternalChange({ text: 'disk', savedText: 'disk' }, 'disk')).toBe('ignore');
  });

  it('reloads a clean doc silently', () => {
    expect(decideExternalChange({ text: 'old', savedText: 'old' }, 'new')).toBe('reload');
  });

  it('flags a conflict for a dirty doc that differs from disk', () => {
    expect(decideExternalChange({ text: 'mine', savedText: 'old' }, 'theirs')).toBe('conflict');
  });

  it('marks a dirty doc saved when disk already holds exactly the buffer', () => {
    expect(decideExternalChange({ text: 'same', savedText: 'old' }, 'same')).toBe('markSaved');
  });
});

describe('applyExternalChange', () => {
  it('reloads a clean open file with the disk text (LF) and its line ending', async () => {
    const { store, deps } = setup(makeDoc(), { content: 'two\r\nthree\r\n', eol: 'crlf' });
    await applyExternalChange(deps, PATH);
    const doc = store.getState().docs[PATH];
    expect(doc.text).toBe('two\nthree\n');
    expect(doc.savedText).toBe('two\nthree\n');
    expect(doc.eol).toBe('crlf');
    expect(doc.conflict).toBe(false);
  });

  it('keeps the buffer of a dirty file and sets the conflict flag', async () => {
    const { store, deps } = setup(makeDoc({ text: 'mine\n' }), { content: 'theirs\n' });
    await applyExternalChange(deps, PATH);
    const doc = store.getState().docs[PATH];
    expect(doc.text).toBe('mine\n');
    expect(doc.savedText).toBe('one\n');
    expect(doc.conflict).toBe(true);
  });

  it('does nothing for a file that is not open', async () => {
    const { fs, deps } = setup(makeDoc(), { content: 'x' });
    await applyExternalChange(deps, 'C:\\w\\other.ts');
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('keeps the doc unchanged when the file cannot be read', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, deps } = setup(makeDoc(), new Error('not-found'));
    const before = store.getState().docs[PATH];
    await applyExternalChange(deps, PATH);
    expect(store.getState().docs[PATH]).toBe(before);
    spy.mockRestore();
  });

  it('does not wipe a clean buffer when the file became too large', async () => {
    const { store, deps } = setup(makeDoc(), { content: '', tooLarge: true, size: 6 * 1024 * 1024 });
    await applyExternalChange(deps, PATH);
    expect(store.getState().docs[PATH].text).toBe('one\n');
  });
});

describe('conflict actions', () => {
  it('Reload replaces the dirty buffer with the disk version and clears the conflict', async () => {
    const { store, deps } = setup(makeDoc({ text: 'mine\n', conflict: true }), { content: 'theirs\n' });
    expect(await reloadFromDisk(deps, PATH)).toBe(true);
    const doc = store.getState().docs[PATH];
    expect(doc.text).toBe('theirs\n');
    expect(doc.savedText).toBe('theirs\n');
    expect(doc.conflict).toBe(false);
  });

  it('Keep mine clears the conflict and keeps the buffer dirty', () => {
    const { store } = setup(makeDoc({ text: 'mine\n', conflict: true }), { content: 'theirs\n' });
    keepMine(store, PATH);
    const doc = store.getState().docs[PATH];
    expect(doc.text).toBe('mine\n');
    expect(doc.conflict).toBe(false);
    expect(doc.text).not.toBe(doc.savedText);
  });
});

describe('startExternalChanges', () => {
  it('watches the open workspace and follows workspace changes', async () => {
    const { store, fs, deps } = setup(makeDoc(), { content: 'x' });
    const stop = startExternalChanges(deps);
    expect(fs.watch).toHaveBeenCalledWith('C:\\w');
    store.dispatch({ type: 'workspace/set', workspace: null });
    expect(fs.unwatch).toHaveBeenCalled();
    stop();
  });

  it('reacts to fs.onChange: change events update docs, tree events bump the explorer', async () => {
    const { store, deps, emit } = setup(makeDoc({ text: 'mine\n' }), { content: 'theirs\n' });
    const stop = startExternalChanges(deps);
    emit({ type: 'change', path: PATH });
    await flush();
    expect(store.getState().docs[PATH].conflict).toBe(true);
    const before = store.getState().explorerVersion;
    emit({ type: 'addDir', path: 'C:\\w\\new' });
    expect(store.getState().explorerVersion).toBe(before + 1);
    stop();
    emit({ type: 'unlink', path: PATH });
    expect(store.getState().explorerVersion).toBe(before + 1);
  });
});
