import { describe, expect, it, vi } from 'vitest';
import { createDemoApi, DEMO_ROOT } from './demoFs';
import { api, isDesktop } from '../platform';
import type { FsChangeEvent } from '../types';

const R = DEMO_ROOT;

describe('platform bridge', () => {
  it('falls back to the in-memory demo workspace without Electron', async () => {
    expect(isDesktop).toBe(false);
    expect(await api.fs.openFolderDialog()).toBe(R);
  });
});

describe('demo file system', () => {
  it('lists folders first, alphabetically, and hides node_modules and .git', async () => {
    const fs = createDemoApi().fs;
    const entries = await fs.readDir(R);
    const names = entries.map((e) => e.name);
    expect(names).not.toContain('node_modules');
    expect(names).not.toContain('.git');
    const firstFile = entries.findIndex((e) => !e.isDir);
    expect(entries.slice(0, firstFile).every((e) => e.isDir)).toBe(true);
    expect(entries.slice(firstFile).every((e) => !e.isDir)).toBe(true);
    const dirs = entries.filter((e) => e.isDir).map((e) => e.name);
    expect(dirs).toEqual([...dirs].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
    expect(entries.find((e) => e.name === 'src')?.path).toBe(`${R}\\src`);
  });

  it('lists every file below the root with the same ignores', async () => {
    const files = await createDemoApi().fs.listFiles(R);
    expect(files).toContain(`${R}\\src\\api\\forecast.ts`);
    expect(files.some((f) => f.includes('node_modules') || f.includes('\\.git\\'))).toBe(false);
  });

  it('reads files and opens files above 5 MB as too large without content', async () => {
    const fs = createDemoApi().fs;
    const readme = await fs.readFile(`${R}\\README.md`);
    expect(readme.content).toContain('weather-cli');
    expect(readme.tooLarge).toBe(false);
    expect(readme.size).toBeGreaterThan(0);
    const big = await fs.readFile(`${R}\\data\\archive-2025.json`);
    expect(big.tooLarge).toBe(true);
    expect(big.content).toBe('');
    expect(big.size).toBeGreaterThan(5 * 1024 * 1024);
  });

  it('rejects paths outside the workspace, also via "..", with a short code', async () => {
    const fs = createDemoApi().fs;
    await expect(fs.readFile('C:\\Windows\\win.ini')).rejects.toThrow(/^path-not-allowed$/);
    await expect(fs.readFile(`${R}\\..\\secret.txt`)).rejects.toThrow(/^path-not-allowed$/);
    await expect(fs.readFile(`${R}\\missing.txt`)).rejects.toThrow(/^not-found$/);
  });

  it('creates, writes, renames and trashes, and reports the changes to a watcher', async () => {
    vi.useFakeTimers();
    try {
      const fs = createDemoApi().fs;
      const events: FsChangeEvent[] = [];
      const off = fs.onChange((e) => events.push(e));
      await fs.watch(R);
      await fs.createDir(`${R}\\notes`);
      await fs.createFile(`${R}\\notes\\todo.md`);
      await fs.writeFile(`${R}\\notes\\todo.md`, 'buy milk\r\n');
      await expect(fs.createFile(`${R}\\notes\\todo.md`)).rejects.toThrow('already-exists');
      await fs.rename(`${R}\\notes`, `${R}\\docs2`);
      expect((await fs.readFile(`${R}\\docs2\\todo.md`)).content).toBe('buy milk\r\n');
      await fs.trash(`${R}\\docs2`);
      await expect(fs.stat(`${R}\\docs2`)).rejects.toThrow('not-found');
      vi.runAllTimers();
      off();
      expect(events.map((e) => e.type)).toEqual(['addDir', 'add', 'change', 'unlinkDir', 'addDir', 'unlinkDir']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps settings and session, and clearing recent workspaces removes every workspace path', async () => {
    const demo = createDemoApi();
    const settings = await demo.settings.load();
    await demo.settings.save({ ...settings, fontSize: 16 });
    const session = await demo.session.load();
    await demo.session.save({ ...session, recentWorkspaces: [R], lastWorkspace: R, openTabs: [{ path: `${R}\\README.md`, preview: false }] });
    await demo.session.clearRecent();
    const cleared = await demo.session.load();
    expect(cleared.recentWorkspaces).toEqual([]);
    expect(cleared.lastWorkspace).toBeNull();
    expect(JSON.stringify(cleared)).not.toContain('weather-cli');
  });

  it('answers the app methods without a native shell', async () => {
    const app = createDemoApi().app;
    const info = await app.getVersion();
    expect(info.name).toBe('Code Editor');
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    await expect(app.openExternal('http://example.com')).rejects.toThrow('invalid-url');
    await expect(app.openExternal('javascript:alert(1)')).rejects.toThrow('invalid-url');
    await app.setTitle('x — Code Editor');
    expect(document.title).toBe('x — Code Editor');
    const off = app.onMenuCommand(() => undefined);
    expect(typeof off).toBe('function');
    off();
  });

  it('validates search requests and returns an empty result for an empty query', async () => {
    const search = createDemoApi().search;
    const base = { id: 's1', root: R, query: '', caseSensitive: false, wholeWord: false, regex: false, include: '', exclude: '' };
    expect(await search.run(base)).toEqual({ id: 's1', files: [], truncated: false, timedOut: false });
    await expect(search.run({ ...base, query: 'x'.repeat(501) })).rejects.toThrow('invalid-argument');
  });
});
