// @vitest-environment node
/**
 * Main process, preload, security and logging of the skeleton, with Electron
 * replaced by a fake (Electron itself is never launched in a test).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const electronPath = nodeRequire.resolve('electron');

/** The bridge contract: group → methods (src/platform.ts `interface Api`). */
const API_SHAPE: Record<string, string[]> = {
  fs: [
    'openFolderDialog',
    'openFileDialog',
    'saveAsDialog',
    'readDir',
    'listFiles',
    'readFile',
    'writeFile',
    'createFile',
    'createDir',
    'rename',
    'trash',
    'reveal',
    'stat',
    'watch',
    'unwatch',
    'onChange',
  ],
  search: ['run', 'cancel'],
  settings: ['load', 'save'],
  session: ['load', 'save', 'clearRecent'],
  app: ['setTitle', 'onMenuCommand', 'onBeforeClose', 'confirmClose', 'getVersion', 'openExternal', 'copyText', 'setMenuState'],
};
const EVENT_METHODS = new Set(['fs.onChange', 'app.onMenuCommand', 'app.onBeforeClose']);
const INVOKE_CHANNELS = Object.entries(API_SHAPE)
  .flatMap(([group, methods]) => methods.map((m) => `${group}:${m}`))
  .filter((ch) => !EVENT_METHODS.has(ch.replace(':', '.')))
  .sort();

type Handler = (...args: unknown[]) => unknown;

function withFakeElectron<T>(fake: unknown, file: string): T {
  const loaded = nodeRequire.cache[electronPath];
  nodeRequire.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: fake } as NodeJS.Module;
  const target = nodeRequire.resolve(file);
  delete nodeRequire.cache[target];
  try {
    return nodeRequire(file) as T;
  } finally {
    if (loaded) nodeRequire.cache[electronPath] = loaded;
    else delete nodeRequire.cache[electronPath];
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createFakeMainElectron() {
  const handlers = new Map<string, Handler>();
  const appEvents = new Map<string, Handler>();
  const windows: FakeWindow[] = [];
  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  class FakeWindow {
    options: Record<string, any>;
    events = new Map<string, Handler>();
    webContents = { send: vi.fn(), on: vi.fn() };
    loadFile = vi.fn(() => Promise.resolve());
    setTitle = vi.fn();
    close = vi.fn();
    show = vi.fn();
    constructor(options: Record<string, any>) {
      this.options = options;
      windows.push(this);
    }
    on(event: string, fn: Handler) {
      this.events.set(event, fn);
      return this;
    }
    once(event: string, fn: Handler) {
      return this.on(event, fn);
    }
    isDestroyed() {
      return false;
    }
  }

  const electron = {
    app: {
      requestSingleInstanceLock: () => true,
      enableSandbox: vi.fn(),
      setAppUserModelId: vi.fn(),
      on: (event: string, fn: Handler) => appEvents.set(event, fn),
      whenReady: () => ready,
      quit: vi.fn(),
      getVersion: () => '0.1.0',
      isPackaged: false,
    },
    BrowserWindow: FakeWindow,
    ipcMain: {
      handle: (channel: string, fn: Handler) => {
        if (handlers.has(channel)) throw new Error(`duplicate handler ${channel}`);
        handlers.set(channel, fn);
      },
    },
    shell: { openExternal: vi.fn(() => Promise.resolve()) },
    dialog: {},
    clipboard: { writeText: vi.fn() },
    session: {
      defaultSession: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
        webRequest: { onBeforeRequest: vi.fn() },
      },
    },
    Menu: {},
    nativeTheme: { shouldUseDarkColors: false },
  };
  return { electron, handlers, appEvents, windows, resolveReady };
}

async function startMain() {
  const fake = createFakeMainElectron();
  const before = {
    uncaught: process.listeners('uncaughtException'),
    unhandled: process.listeners('unhandledRejection'),
  };
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  withFakeElectron(fake.electron, './main.cjs');
  fake.resolveReady();
  await flush();
  log.mockRestore();
  for (const l of process.listeners('uncaughtException')) if (!before.uncaught.includes(l)) process.off('uncaughtException', l);
  for (const l of process.listeners('unhandledRejection')) if (!before.unhandled.includes(l)) process.off('unhandledRejection', l);
  const win = fake.windows[0];
  const trusted = { sender: win.webContents, senderFrame: { url: 'file:///C:/app/dist/index.html', parent: null } };
  const call = (channel: string, ...args: unknown[]) => fake.handlers.get(channel)!(trusted, ...args);
  return { ...fake, win, trusted, call };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('main process (AC-18, AC-22, AC-23, AC-26)', () => {
  it('opens one sandboxed, context-isolated window without Node integration', async () => {
    const { windows, electron } = await startMain();
    expect(windows).toHaveLength(1);
    const prefs = windows[0].options.webPreferences;
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.webviewTag).toBe(false);
    expect(prefs.spellcheck).toBe(false);
    expect(String(prefs.preload)).toMatch(/preload\.cjs$/);
    expect(electron.app.enableSandbox).toHaveBeenCalled();
    expect(windows[0].loadFile).toHaveBeenCalledWith(expect.stringMatching(/dist[\\/]index\.html$/));
  });

  it('registers exactly the invoke channels of the bridge, each once', async () => {
    const { handlers } = await startMain();
    expect([...handlers.keys()].sort()).toEqual(INVOKE_CHANNELS);
  });

  it('refuses calls from anything but its own top frame', async () => {
    const { handlers, win } = await startMain();
    const foreign = { sender: win.webContents, senderFrame: { url: 'https://example.com/', parent: null } };
    await expect(handlers.get('app:getVersion')!(foreign)).rejects.toThrow('forbidden');
  });

  it('answers module stubs with a short code and app handlers for real', async () => {
    const { call, electron, win } = await startMain();
    await expect(call('fs:readDir', 'C:\\x')).rejects.toThrow(/^[a-z][a-z0-9-]*$/);
    await expect(call('app:getVersion')).resolves.toEqual({ name: 'Code Editor', version: '0.1.0' });
    await call('app:setTitle', 'a.ts — Code Editor');
    expect(win.setTitle).toHaveBeenCalledWith('a.ts — Code Editor');
    await expect(call('app:setTitle', 42)).rejects.toThrow(/^invalid-argument$/);
    await call('app:copyText', 'hello');
    expect(electron.clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('opens external links only for https: URLs', async () => {
    const { call, electron } = await startMain();
    await expect(call('app:openExternal', 'http://example.com/')).rejects.toThrow(/^invalid-url$/);
    await expect(call('app:openExternal', 'file:///C:/Windows/system.ini')).rejects.toThrow(/^invalid-url$/);
    expect(electron.shell.openExternal).not.toHaveBeenCalled();
    await call('app:openExternal', 'https://example.com/docs');
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('cancels every remote request and denies all permissions', async () => {
    const { electron } = await startMain();
    const [filter, listener] = electron.session.defaultSession.webRequest.onBeforeRequest.mock.calls[0] as unknown as [
      { urls: string[] },
      (d: unknown, cb: (r: unknown) => void) => void,
    ];
    expect(filter.urls).toEqual(expect.arrayContaining(['http://*/*', 'https://*/*']));
    const cb = vi.fn();
    listener({}, cb);
    expect(cb).toHaveBeenCalledWith({ cancel: true });
    const [permission] = electron.session.defaultSession.setPermissionRequestHandler.mock.calls[0] as unknown as [
      (wc: unknown, p: string, cb: (ok: boolean) => void) => void,
    ];
    const allow = vi.fn();
    permission({}, 'media', allow);
    expect(allow).toHaveBeenCalledWith(false);
  });

  it('asks the renderer before closing and closes once it confirms', async () => {
    const { win, call } = await startMain();
    const event = { preventDefault: vi.fn() };
    win.events.get('close')!(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith('app:onBeforeClose');
    await call('app:confirmClose', true);
    expect(win.close).toHaveBeenCalled();
    const second = { preventDefault: vi.fn() };
    win.events.get('close')!(second);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it('hardens every web contents it creates', async () => {
    const { appEvents } = await startMain();
    const contents = { on: vi.fn(), setWindowOpenHandler: vi.fn(), getURL: () => 'file:///C:/app/dist/index.html' };
    appEvents.get('web-contents-created')!({}, contents);
    expect(contents.setWindowOpenHandler).toHaveBeenCalled();
    expect(contents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
  });
});

describe('navigation rules (AC-23)', () => {
  const security = nodeRequire('./security.cjs') as {
    isSafeExternalUrl(u: unknown): boolean;
    hardenWebContents(c: unknown, open: (u: string) => Promise<void>): void;
    assertAllowedPath(p: string): void;
  };

  function harden() {
    const events = new Map<string, Handler>();
    let openHandler: Handler = () => undefined;
    const contents = {
      on: (event: string, fn: Handler) => events.set(event, fn),
      setWindowOpenHandler: (fn: Handler) => {
        openHandler = fn;
      },
      getURL: () => 'file:///C:/app/dist/index.html',
    };
    const open = vi.fn(() => Promise.resolve());
    security.hardenWebContents(contents, open);
    return { events, open, openWindow: (url: string) => openHandler({ url }) };
  }

  it('accepts only https: URLs as external', () => {
    expect(security.isSafeExternalUrl('https://example.com/a')).toBe(true);
    expect(security.isSafeExternalUrl('http://example.com/')).toBe(false);
    expect(security.isSafeExternalUrl('file:///C:/x')).toBe(false);
    expect(security.isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(security.isSafeExternalUrl('https://user:pw@example.com/')).toBe(false);
    expect(security.isSafeExternalUrl(42)).toBe(false);
  });

  it('blocks navigation away from the app and hands https: links to the OS', async () => {
    const { events, open } = harden();
    const external = { url: 'https://example.com/', preventDefault: vi.fn() };
    events.get('will-navigate')!(external);
    const foreign = { url: 'http://evil.example/', preventDefault: vi.fn() };
    events.get('will-navigate')!(foreign);
    const sameDoc = { url: 'file:///C:/app/dist/index.html#/gallery', preventDefault: vi.fn() };
    events.get('will-navigate')!(sameDoc);
    await flush();
    expect(external.preventDefault).toHaveBeenCalled();
    expect(foreign.preventDefault).toHaveBeenCalled();
    expect(sameDoc.preventDefault).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.com/');
  });

  it('denies every new window and webview', async () => {
    const { events, open, openWindow } = harden();
    expect(openWindow('https://example.com/')).toEqual({ action: 'deny' });
    expect(openWindow('file:///C:/secret')).toEqual({ action: 'deny' });
    const attach = { preventDefault: vi.fn() };
    events.get('will-attach-webview')!(attach);
    await flush();
    expect(attach.preventDefault).toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('fails closed for file-system paths until the allow-list is implemented', () => {
    expect(() => security.assertAllowedPath('C:\\Users\\a\\x.txt')).toThrow('path-not-allowed');
  });
});

describe('preload bridge (AC-18, AC-22)', () => {
  function loadPreload() {
    const exposed: { name?: string; api?: Record<string, Record<string, Handler>> } = {};
    const listeners = new Map<string, Handler>();
    const ipcRenderer = {
      invoke: vi.fn((..._args: unknown[]) => Promise.resolve('ok')),
      on: vi.fn((channel: string, fn: Handler) => listeners.set(channel, fn)),
      removeListener: vi.fn(),
    };
    const contextBridge = {
      exposeInMainWorld: (name: string, value: Record<string, Record<string, Handler>>) => {
        exposed.name = name;
        exposed.api = value;
      },
    };
    withFakeElectron({ contextBridge, ipcRenderer }, './preload.cjs');
    return { exposed, ipcRenderer, listeners };
  }

  it('exposes exactly the contract methods as window.api', () => {
    const { exposed } = loadPreload();
    expect(exposed.name).toBe('api');
    const api = exposed.api!;
    expect(Object.keys(api).sort()).toEqual(Object.keys(API_SHAPE).sort());
    for (const [group, methods] of Object.entries(API_SHAPE)) {
      expect(Object.keys(api[group]).sort()).toEqual([...methods].sort());
      for (const m of methods) expect(typeof api[group][m]).toBe('function');
    }
  });

  it('invokes the <group>:<method> channel and rejects with the bare error code', async () => {
    const { exposed, ipcRenderer } = loadPreload();
    await exposed.api!.fs.readDir('C:\\w');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('fs:readDir', 'C:\\w');
    ipcRenderer.invoke.mockImplementationOnce(() =>
      Promise.reject(new Error("Error invoking remote method 'fs:readFile': Error: path-not-allowed")),
    );
    await expect(exposed.api!.fs.readFile('C:\\x')).rejects.toThrow(/^path-not-allowed$/);
  });

  it('subscribes to events and confirms closing when nobody guards it', () => {
    const { exposed, ipcRenderer, listeners } = loadPreload();
    const cb = vi.fn();
    const off = exposed.api!.app.onMenuCommand(cb) as () => void;
    listeners.get('app:onMenuCommand')!({}, 'file.save');
    expect(cb).toHaveBeenCalledWith('file.save');
    off();
    expect(ipcRenderer.removeListener).toHaveBeenCalled();

    listeners.get('app:onBeforeClose')!({});
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('app:confirmClose', true);

    ipcRenderer.invoke.mockClear();
    const guard = vi.fn();
    exposed.api!.app.onBeforeClose(guard);
    listeners.get('app:onBeforeClose')!({});
    expect(guard).toHaveBeenCalled();
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });
});

describe('logging (AC-28)', () => {
  const log = nodeRequire('./log.cjs') as {
    redact(t: string): string;
    format(level: string, event: string, fields?: unknown): string;
    errorCode(e: unknown): string;
  };

  it('replaces full paths with a placeholder', () => {
    expect(log.redact("ENOENT: no such file or directory, open 'C:\\Users\\anna\\Projects\\secret plan.txt'")).toBe(
      "ENOENT: no such file or directory, open '<path>'",
    );
    expect(log.redact('read /home/anna/notes/todo.md failed')).toBe('read <path> failed');
    expect(log.redact('share \\\\server\\team\\file.txt')).toBe('share <path>');
    expect(log.redact('loaded file:///C:/app/dist/index.html')).toBe('loaded <path>');
  });

  it('formats errors and fields without paths or long contents', () => {
    const err = Object.assign(new Error("EACCES: permission denied, open 'D:\\Work\\a.ts'"), { code: 'EACCES' });
    const line = log.format('ERROR', 'ipc.failed', { channel: 'fs:readFile', error: err, text: 'x'.repeat(500) });
    expect(line).not.toContain('D:\\Work');
    expect(line).toContain('EACCES');
    expect(line).toContain('<path>');
    expect(line.length).toBeLessThan(400);
  });

  it('lets only short codes cross the IPC boundary', () => {
    expect(log.errorCode(new Error('not-found'))).toBe('not-found');
    expect(log.errorCode(new Error("ENOENT: open 'C:\\x'"))).toBe('internal-error');
    expect(log.errorCode('boom')).toBe('internal-error');
  });
});
