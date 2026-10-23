// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const req = createRequire(import.meta.url);
const persistence = req('./ipc/persistence.cjs');
const security = req('./security.cjs');

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'recent-'));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// persistence keeps one store per process (the userData directory), so this file registers once.
const userData = tmp();
const handlers: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
persistence.register({
  handle: (c: string, fn: (...a: unknown[]) => Promise<unknown>) => (handlers[c] = fn),
  electron: { app: { getPath: () => userData } },
  log: null,
  security,
});

function writeStored(recentWorkspaces: string[], lastWorkspace: string | null = null): void {
  persistence.createStore(userData, null).saveSession({
    recentWorkspaces,
    lastWorkspace,
    openTabs: [],
    activeTab: null,
    sidebarWidth: 260,
    windowBounds: null,
  });
}

function stored(): { recentWorkspaces: string[]; lastWorkspace: string | null } {
  return JSON.parse(fs.readFileSync(path.join(userData, 'session.json'), 'utf8'));
}

function allowed(p: string): boolean {
  try {
    security.assertAllowedPath(p);
    return true;
  } catch {
    return false;
  }
}

beforeEach(() => {
  security.resetAllowed();
});

describe('session:load and recent workspaces', () => {
  it('allows every stored recent workspace that still exists, never a vanished one', async () => {
    const existing = tmp();
    const gone = path.join(userData, 'gone');
    writeStored([existing, gone]);
    const session = (await handlers['session:load']()) as { recentWorkspaces: string[] };
    expect(session.recentWorkspaces).toEqual([existing, gone]);
    expect(allowed(path.join(existing, 'a.txt'))).toBe(true);
    expect(allowed(path.join(gone, 'a.txt'))).toBe(false);
  });

  it('does not store, and so never grants, a workspace path the renderer injects', async () => {
    const chosen = tmp();
    const injected = tmp();
    writeStored([chosen]);
    await handlers['session:save']({ recentWorkspaces: [injected, chosen], lastWorkspace: injected, openTabs: [] });
    expect(stored().recentWorkspaces).toEqual([chosen]);
    expect(stored().lastWorkspace).toBeNull();

    security.resetAllowed();
    await handlers['session:load']();
    expect(allowed(path.join(injected, 'secret.txt'))).toBe(false);
    expect(allowed(path.join(chosen, 'a.txt'))).toBe(true);
  });

  it('stores a folder the user chose in this run so it reopens after a restart', async () => {
    writeStored([]);
    const picked = tmp();
    security.allowRoot(picked); // what fs:openFolderDialog does
    await handlers['session:save']({ recentWorkspaces: [picked], lastWorkspace: picked, openTabs: [] });
    expect(stored().recentWorkspaces).toEqual([picked]);
    expect(stored().lastWorkspace).toBe(picked);

    security.resetAllowed(); // restart
    await handlers['session:load']();
    expect(allowed(path.join(picked, 'a.txt'))).toBe(true);
  });
});
