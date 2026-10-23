// @vitest-environment node
/** Workspace search IPC and its worker thread, with Electron mocked (AC-12, AC-24). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const nodeRequire = createRequire(import.meta.url);
const security = nodeRequire('./security.cjs');
const validate = nodeRequire('./validate.cjs');
const searchIpc = nodeRequire('./ipc/search.cjs');
const worker = nodeRequire('./ipc/search-worker.cjs');

type Fn = (...a: unknown[]) => Promise<unknown>;
interface Resp {
  id: string;
  files: { path: string; matches: { line: number; start: number; end: number; preview: string }[] }[];
  truncated: boolean;
  timedOut: boolean;
  error?: string;
}

let tmp: string;
let ws: string;
let handlers: Map<string, Fn>;
const call = (ch: string, ...a: unknown[]) => handlers.get(ch)!(...a) as Promise<Resp>;

const req = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  root: ws,
  query: 'cache',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  include: '',
  exclude: '',
  ...over,
});

const rel = (r: Resp) => r.files.map((f) => path.relative(ws, f.path).replace(/\\/g, '/'));

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'search-')));
  ws = path.join(tmp, 'ws');
  fs.mkdirSync(path.join(ws, 'src', 'api'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'node_modules', 'x'), { recursive: true });
  fs.mkdirSync(path.join(ws, '.git'));
  fs.mkdirSync(path.join(ws, 'test'));
  fs.writeFileSync(path.join(ws, 'README.md'), 'Results are cached.\r\nSkip the cache.\r\n');
  fs.writeFileSync(path.join(ws, 'src', 'api', 'cache.ts'), 'export function cacheGet() {}\nconst Cache = 1;\n');
  fs.writeFileSync(path.join(ws, 'test', 'cache.test.ts'), 'it("uses the cache")\n');
  fs.writeFileSync(path.join(ws, 'node_modules', 'x', 'i.js'), 'cache');
  fs.writeFileSync(path.join(ws, '.git', 'HEAD'), 'cache');
  fs.writeFileSync(path.join(ws, 'image.bin'), Buffer.from([0x63, 0x61, 0x63, 0x68, 0x65, 0x00, 0x01]));
  fs.writeFileSync(path.join(tmp, 'outside.txt'), 'cache');
  security.resetAllowed();
  handlers = new Map();
  searchIpc.register({ handle: (ch: string, fn: Fn) => handlers.set(ch, fn), security, validate });
});

afterEach(() => {
  searchIpc.dispose();
  security.resetAllowed();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('search IPC', () => {
  it('registers both contract channels', () => {
    expect([...handlers.keys()].sort()).toEqual([...searchIpc.CHANNELS].sort());
  });

  it('rejects a root outside the allowed workspace', async () => {
    await expect(call('search:run', req())).rejects.toThrow('path-not-allowed');
  });

  it('validates the request shape and the 500-character query limit', async () => {
    security.allowRoot(ws);
    await expect(call('search:run', req({ query: 'x'.repeat(501) }))).rejects.toThrow('invalid-argument');
    await expect(call('search:run', req({ regex: 'yes' }))).rejects.toThrow('invalid-argument');
    await expect(call('search:run', 'cache')).rejects.toThrow('invalid-argument');
    await expect(handlers.get('search:cancel')!(42)).rejects.toThrow('invalid-argument');
  });

  it('searches the workspace in a worker, grouped by file, skipping ignored folders and binaries', async () => {
    security.allowRoot(ws);
    const r = await call('search:run', req());
    expect(r.error).toBeUndefined();
    expect(r.truncated).toBe(false);
    expect(r.timedOut).toBe(false);
    expect(rel(r)).toEqual(['README.md', 'src/api/cache.ts', 'test/cache.test.ts']);
    const readme = r.files[0];
    expect(path.isAbsolute(readme.path)).toBe(true);
    expect(readme.matches).toEqual([
      { line: 1, start: 12, end: 17, preview: 'Results are cached.' },
      { line: 2, start: 9, end: 14, preview: 'Skip the cache.' },
    ]);
  });

  it('honours case, whole word and regex options', async () => {
    security.allowRoot(ws);
    const cs = await call('search:run', req({ query: 'Cache', caseSensitive: true }));
    expect(rel(cs)).toEqual(['src/api/cache.ts']);
    const word = await call('search:run', req({ wholeWord: true }));
    expect(word.files.flatMap((f) => f.matches.map((m) => m.preview))).toEqual(['Skip the cache.', 'const Cache = 1;', 'it("uses the cache")']);
    const re = await call('search:run', req({ query: 'cache(Get|d)', regex: true }));
    expect(rel(re)).toEqual(['README.md', 'src/api/cache.ts']);
  });

  it('honours include and exclude globs', async () => {
    security.allowRoot(ws);
    expect(rel(await call('search:run', req({ include: 'src/**' })))).toEqual(['src/api/cache.ts']);
    expect(rel(await call('search:run', req({ exclude: 'test/**, *.md' })))).toEqual(['src/api/cache.ts']);
  });

  it('answers invalid-regex for a broken pattern and nothing for an empty query', async () => {
    security.allowRoot(ws);
    expect((await call('search:run', req({ query: '(', regex: true }))).error).toBe('invalid-regex');
    const empty = await call('search:run', req({ query: '' }));
    expect(empty.files).toEqual([]);
    expect(empty.error).toBeUndefined();
  });

  it('caps the matches and flags the response as truncated', async () => {
    security.allowRoot(ws);
    const service = searchIpc.createSearchService({ validate, security, maxMatches: 2 });
    const r = (await service.run(req())) as Resp;
    expect(r.truncated).toBe(true);
    expect(r.files.reduce((n, f) => n + f.matches.length, 0)).toBe(2);
  });

  it('terminates a pathological regex on timeout without blocking the main thread', async () => {
    security.allowRoot(ws);
    fs.writeFileSync(path.join(ws, 'evil.txt'), 'a'.repeat(40) + '!');
    const service = searchIpc.createSearchService({ validate, security, timeoutMs: 300 });
    const started = Date.now();
    const r = (await service.run(req({ query: '(a+)+$', regex: true, include: 'evil.txt' }))) as Resp;
    expect(r.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(service.active.size).toBe(0);
  }, 10000);

  it('cancels a running search and terminates its worker', async () => {
    security.allowRoot(ws);
    const fake = Object.assign(new EventEmitter(), { terminated: false, terminate: async () => ((fake.terminated = true), 0) });
    const service = searchIpc.createSearchService({ validate, security, spawn: () => fake });
    const pending = service.run(req({ id: 'slow' }));
    fake.emit('message', { type: 'file', file: { path: path.join(ws, 'README.md'), matches: [{ line: 1, start: 0, end: 1, preview: 'R' }] } });
    service.cancel('slow');
    const r = (await pending) as Resp;
    expect(r.error).toBe('cancelled');
    expect(r.files).toHaveLength(1);
    expect(fake.terminated).toBe(true);
    service.cancel('unknown-id'); // no-op
  });
});

describe('search worker helpers', () => {
  it('matches globs like the renderer', () => {
    expect(worker.matchGlob('*.ts', 'src/a.ts')).toBe(true);
    expect(worker.matchGlob('test', 'src/test/a.ts')).toBe(true);
    expect(worker.matchGlob('/src/**/*.ts', 'src/a.ts')).toBe(true);
    expect(worker.matchGlob('src/*.ts', 'lib/a.ts')).toBe(false);
  });

  it('recognises binary content by a NUL byte', () => {
    expect(worker.isBinary(Buffer.from('plain text'))).toBe(false);
    expect(worker.isBinary(Buffer.from([0x61, 0x00]))).toBe(true);
  });
});
