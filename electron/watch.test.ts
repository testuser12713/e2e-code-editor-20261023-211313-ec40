/** Disk watching IPC (electron/ipc/watch.cjs) with fs.watch replaced by a fake. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const nodeRequire = createRequire(import.meta.url);
const security = nodeRequire('./security.cjs');
const validate = nodeRequire('./validate.cjs');
const watchIpc = nodeRequire('./ipc/watch.cjs');

type Raw = (eventType: string, filename: string | null) => void;
type Fn = (...a: unknown[]) => Promise<unknown>;

class FakeWatcher extends EventEmitter {
  closed = false;
  close() {
    this.closed = true;
  }
}

let tmp: string;
let ws: string;
let raw: Raw;
let watchers: FakeWatcher[];
let watchFn: ReturnType<typeof vi.fn>;
let handlers: Map<string, Fn>;
let sent: { channel: string; payload: { type: string; path: string } }[];

const call = (ch: string, ...a: unknown[]) => handlers.get(ch)!(...a);
const settle = () => new Promise((r) => setTimeout(r, 40));

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'watchipc-')));
  ws = path.join(tmp, 'ws');
  fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'a.txt'), 'a');
  security.resetAllowed();
  security.allowRoot(ws);
  watchers = [];
  watchFn = vi.fn((_root: string, _opts: unknown, cb: Raw) => {
    raw = cb;
    const w = new FakeWatcher();
    watchers.push(w);
    return w;
  });
  handlers = new Map();
  sent = [];
  watchIpc.register(
    {
      handle: (ch: string, fn: Fn) => handlers.set(ch, fn),
      send: (channel: string, payload: { type: string; path: string }) => sent.push({ channel, payload }),
      security,
      validate,
    },
    { watch: watchFn, debounceMs: 5 },
  );
});

afterEach(() => {
  watchIpc.dispose();
  security.resetAllowed();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('watch IPC', () => {
  it('registers exactly its contract channels', () => {
    expect([...handlers.keys()].sort()).toEqual([...watchIpc.CHANNELS].sort());
    expect(watchIpc.CHANGE_EVENT).toBe('fs:onChange');
  });

  it('refuses a root outside the allowed workspace', async () => {
    await expect(call('fs:watch', tmp)).rejects.toThrow('path-not-allowed');
    expect(watchFn).not.toHaveBeenCalled();
  });

  it('watches the root recursively and classifies add, change, addDir and unlink', async () => {
    await call('fs:watch', ws);
    expect(watchFn).toHaveBeenCalledTimes(1);
    expect(watchFn.mock.calls[0][1]).toMatchObject({ recursive: true });
    await settle();

    fs.writeFileSync(path.join(ws, 'new.ts'), '');
    raw('rename', 'new.ts');
    raw('change', 'new.ts'); // collapsed into the rename of the same path
    fs.mkdirSync(path.join(ws, 'lib'));
    raw('rename', 'lib');
    raw('change', 'a.txt');
    fs.rmSync(path.join(ws, 'src'), { recursive: true });
    raw('rename', 'src');
    await settle();

    const events = sent.map((s) => s.payload);
    expect(sent.every((s) => s.channel === 'fs:onChange')).toBe(true);
    expect(events).toContainEqual({ type: 'add', path: path.join(ws, 'new.ts') });
    expect(events).toContainEqual({ type: 'addDir', path: path.join(ws, 'lib') });
    expect(events).toContainEqual({ type: 'change', path: path.join(ws, 'a.txt') });
    expect(events).toContainEqual({ type: 'unlinkDir', path: path.join(ws, 'src') });
    expect(events.filter((e) => e.path === path.join(ws, 'new.ts'))).toHaveLength(1);
  });

  it('ignores node_modules and .git', async () => {
    await call('fs:watch', ws);
    raw('change', path.join('node_modules', 'x', 'i.js'));
    raw('rename', '.git');
    raw('change', path.join('.git', 'index'));
    await settle();
    expect(sent).toEqual([]);
  });

  it('unwatch closes the watcher and stops events; a second watch replaces the first', async () => {
    await call('fs:watch', ws);
    await call('fs:watch', ws);
    expect(watchers[0].closed).toBe(true);
    expect(watchers[1].closed).toBe(false);
    await call('fs:unwatch');
    expect(watchers[1].closed).toBe(true);
    raw('change', 'a.txt');
    await settle();
    expect(sent).toEqual([]);
  });

  it('closes itself when the OS watcher fails', async () => {
    await call('fs:watch', ws);
    watchers[0].emit('error', new Error('EPERM'));
    expect(watchers[0].closed).toBe(true);
  });

  it('isIgnored checks every segment', () => {
    expect(watchIpc.isIgnored('a/node_modules/b')).toBe(true);
    expect(watchIpc.isIgnored('.git')).toBe(true);
    expect(watchIpc.isIgnored('src\\app.ts')).toBe(false);
  });
});
