// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const req = createRequire(import.meta.url);
const persistence = req('./ipc/persistence.cjs');
const windowState = req('./windowState.cjs');

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function fakeCtx(dir: string) {
  const handlers: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    handlers,
    log,
    ctx: {
      handle: (c: string, fn: (...a: unknown[]) => Promise<unknown>) => (handlers[c] = fn),
      electron: { app: { getPath: () => dir } },
      log,
      security: { allowRoot: vi.fn() },
    },
  };
}

describe('persistence store', () => {
  it('corrupt settings fall back to defaults without throwing, and the log has no path', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'settings.json'), '{oops');
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const store = persistence.createStore(dir, log);
    expect(store.loadSettings()).toEqual(persistence.DEFAULT_SETTINGS);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(dir);
  });

  it('round-trips session and strips contents', () => {
    const store = persistence.createStore(tmp(), null);
    store.saveSession({
      recentWorkspaces: ['C:\\w'],
      lastWorkspace: 'C:\\w',
      openTabs: [{ path: 'C:\\w\\a.ts', preview: false, text: 'secret' }],
      activeTab: 'C:\\w\\a.ts',
      sidebarWidth: 320,
      windowBounds: { x: 1, y: 2, width: 900, height: 700 },
      docs: { x: 'secret' },
    });
    const s = store.loadSession();
    expect(s.openTabs).toEqual([{ path: 'C:\\w\\a.ts', preview: false }]);
    expect(s.sidebarWidth).toBe(320);
    expect(JSON.stringify(s)).not.toContain('secret');
  });

  it('clearRecent removes every workspace path but keeps geometry', async () => {
    const dir = tmp();
    const { ctx, handlers } = fakeCtx(dir);
    persistence.createStore(dir, null).saveSession({
      recentWorkspaces: ['C:\\w', 'D:\\x'],
      lastWorkspace: 'C:\\w',
      openTabs: [{ path: 'C:\\w\\a.ts', preview: false }],
      activeTab: null,
      sidebarWidth: 300,
      windowBounds: { x: 1, y: 2, width: 900, height: 700 },
    });
    persistence.register(ctx);
    await handlers['session:clearRecent']();
    const text = fs.readFileSync(path.join(dir, 'session.json'), 'utf8');
    expect(text).not.toMatch(/[CD]:\\\\/);
    expect(JSON.parse(text).windowBounds.width).toBe(900);
  });
});

describe('windowState', () => {
  it('accepts bounds only on a connected display', () => {
    const displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];
    expect(windowState.isVisibleOnDisplays({ x: 100, y: 100, width: 800, height: 600 }, displays)).toBe(true);
    expect(windowState.isVisibleOnDisplays({ x: 5000, y: 100, width: 800, height: 600 }, displays)).toBe(false);
  });
});
