/** File-system IPC handlers with Electron mocked (AC-17, AC-21). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const nodeRequire = createRequire(import.meta.url);
const security = nodeRequire('./security.cjs');
const validate = nodeRequire('./validate.cjs');
const fsIpc = nodeRequire('./ipc/fs.cjs');

type Fn = (...a: unknown[]) => Promise<unknown>;
let tmp: string;
let ws: string;
let handlers: Map<string, Fn>;
let dialog: { showOpenDialog: ReturnType<typeof vi.fn>; showSaveDialog: ReturnType<typeof vi.fn> };
let shell: { trashItem: ReturnType<typeof vi.fn>; showItemInFolder: ReturnType<typeof vi.fn> };
const call = (ch: string, ...a: unknown[]) => handlers.get(ch)!(...a);

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fsipc-')));
  ws = path.join(tmp, 'ws');
  fs.mkdirSync(path.join(ws, 'src', 'deep'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'node_modules', 'x'), { recursive: true });
  fs.mkdirSync(path.join(ws, '.git'));
  fs.writeFileSync(path.join(ws, 'b.txt'), 'one\r\ntwo\r\n');
  fs.writeFileSync(path.join(ws, 'A.md'), 'x\n');
  fs.writeFileSync(path.join(ws, 'src', 'deep', 'c.ts'), '');
  fs.writeFileSync(path.join(ws, 'node_modules', 'x', 'i.js'), '');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'secret');
  security.resetAllowed();
  handlers = new Map();
  dialog = {
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [ws] })),
    showSaveDialog: vi.fn(async () => ({ canceled: true })),
  };
  shell = { trashItem: vi.fn(async () => undefined), showItemInFolder: vi.fn() };
  fsIpc.register({
    handle: (ch: string, fn: Fn) => handlers.set(ch, fn),
    getWindow: () => null,
    electron: { dialog, shell },
    security,
    validate,
  });
});
afterEach(() => {
  security.resetAllowed();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('fs IPC', () => {
  it('registers every contract channel', () => {
    expect([...handlers.keys()].sort()).toEqual([...fsIpc.CHANNELS].sort());
  });

  it('rejects everything until a folder is chosen, then lists it', async () => {
    await expect(call('fs:readDir', ws)).rejects.toThrow('path-not-allowed');
    expect(await call('fs:openFolderDialog')).toBe(ws);
    const entries = (await call('fs:readDir', ws)) as { name: string; isDir: boolean }[];
    expect(entries.map((e) => e.name)).toEqual(['src', 'A.md', 'b.txt']);
    expect(entries[0].isDir).toBe(true);
  });

  it('rejects paths outside the workspace with a code only', async () => {
    await call('fs:openFolderDialog');
    const outside = path.join(ws, '..', 'secret.txt');
    for (const ch of ['fs:readFile', 'fs:stat', 'fs:trash', 'fs:reveal', 'fs:createFile']) {
      const err = await call(ch, outside).catch((e: Error) => e);
      expect((err as Error).message).toBe('path-not-allowed');
    }
    await expect(call('fs:writeFile', outside, 'x')).rejects.toThrow('path-not-allowed');
    await expect(call('fs:rename', path.join(ws, 'b.txt'), outside)).rejects.toThrow('path-not-allowed');
    expect(fs.readFileSync(path.join(tmp, 'secret.txt'), 'utf8')).toBe('secret');
    expect(shell.trashItem).not.toHaveBeenCalled();
  });

  it('validates argument types', async () => {
    await call('fs:openFolderDialog');
    await expect(call('fs:readDir', 42)).rejects.toThrow('invalid-argument');
    await expect(call('fs:writeFile', path.join(ws, 'b.txt'), { a: 1 })).rejects.toThrow('invalid-argument');
  });

  it('lists files recursively without ignored folders', async () => {
    await call('fs:openFolderDialog');
    const files = (await call('fs:listFiles', ws)) as string[];
    expect(files.map((f) => path.relative(ws, f)).sort()).toEqual(['A.md', 'b.txt', path.join('src', 'deep', 'c.ts')].sort());
  });

  it('reads with eol detection and flags large files without content', async () => {
    await call('fs:openFolderDialog');
    expect(await call('fs:readFile', path.join(ws, 'b.txt'))).toEqual({ content: 'one\r\ntwo\r\n', eol: 'crlf', size: 10, tooLarge: false });
    const big = path.join(ws, 'big.log');
    fs.writeFileSync(big, Buffer.alloc(fsIpc.MAX_READ + 1, 97));
    const r = (await call('fs:readFile', big)) as { content: string; tooLarge: boolean };
    expect(r.tooLarge).toBe(true);
    expect(r.content).toBe('');
  });

  it('writes, creates, renames, stats and trashes inside the workspace', async () => {
    await call('fs:openFolderDialog');
    const f = path.join(ws, 'new.txt');
    await call('fs:createFile', f);
    await expect(call('fs:createFile', f)).rejects.toThrow('already-exists');
    await call('fs:writeFile', f, 'hi');
    expect(fs.readFileSync(f, 'utf8')).toBe('hi');
    await call('fs:createDir', path.join(ws, 'dir'));
    const g = path.join(ws, 'dir', 'moved.txt');
    await call('fs:rename', f, g);
    expect(((await call('fs:stat', g)) as { size: number }).size).toBe(2);
    await expect(call('fs:stat', f)).rejects.toThrow('not-found');
    await call('fs:trash', g);
    expect(shell.trashItem).toHaveBeenCalledWith(g);
  });

  it('a file chosen in the open dialog becomes readable on its own', async () => {
    const secret = path.join(tmp, 'secret.txt');
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [secret] });
    expect(await call('fs:openFileDialog')).toBe(secret);
    expect(((await call('fs:readFile', secret)) as { content: string }).content).toBe('secret');
    await expect(call('fs:readDir', tmp)).rejects.toThrow('path-not-allowed');
  });
});
