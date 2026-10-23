'use strict';
/**
 * Electron main process: ONE BrowserWindow, sandboxed, with context isolation
 * and without Node in the renderer (AC-18, AC-23). Registers every IPC
 * handler of the preload API exactly once and nothing else (AC-22).
 * No telemetry: no crash reporter, no update checks, no spell-check
 * dictionary downloads, and every http(s)/ws request of a renderer is
 * cancelled (AC-26).
 *
 * The handler context `ctx` handed to every module's register(ctx):
 *   ctx.handle(channel, fn)   registers an invoke handler; checks the sender
 *                             and turns every error into a short code
 *   ctx.send(channel, data)   main → renderer event to the app window
 *   ctx.getWindow()           the BrowserWindow or null
 *   ctx.electron              { app, dialog, shell, clipboard, Menu, nativeTheme }
 *   ctx.log, ctx.validate, ctx.security
 */
const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, session, Menu, nativeTheme } = require('electron');
const log = require('./log.cjs');
const security = require('./security.cjs');
const validate = require('./validate.cjs');
const fsIpc = require('./ipc/fs.cjs');
const watchIpc = require('./ipc/watch.cjs');
const searchIpc = require('./ipc/search.cjs');
const persistenceIpc = require('./ipc/persistence.cjs');
const menu = require('./menu.cjs');
const windowState = require('./windowState.cjs');

const APP_NAME = 'Code Editor';
const APP_ID = 'local.codeeditor.app';
const INDEX_HTML = path.join(__dirname, '..', 'dist', 'index.html');

/** Main → renderer event names (the preload listens to exactly these). */
const EVENTS = {
  fsChange: watchIpc.CHANGE_EVENT, // 'fs:onChange'
  menuCommand: menu.MENU_COMMAND_EVENT, // 'app:onMenuCommand'
  beforeClose: 'app:onBeforeClose',
};

/** Invoke channels handled here (the rest live in the modules). */
const APP_CHANNELS = ['app:setTitle', 'app:confirmClose', 'app:getVersion', 'app:openExternal', 'app:copyText'];

let mainWindow = null;
let allowClose = false;

function getWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function send(channel, payload) {
  const win = getWindow();
  if (win) win.webContents.send(channel, payload);
}

/** Only the top frame of our own window, showing our own file, may call the API. */
function isTrustedSender(event) {
  const win = getWindow();
  const frame = event && event.senderFrame;
  if (!win || !frame || event.sender !== win.webContents) return false;
  if (frame.parent) return false;
  return typeof frame.url === 'string' && frame.url.startsWith('file://');
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('forbidden');
    try {
      return await fn(...args);
    } catch (err) {
      const code = log.errorCode(err);
      if (code === 'internal-error') log.error('ipc.failed', { channel, error: err });
      throw new Error(code);
    }
  });
}

const ctx = {
  handle,
  send,
  getWindow,
  electron: { app, dialog, shell, clipboard, Menu, nativeTheme },
  log,
  validate,
  security,
};

function registerAppHandlers() {
  handle('app:setTitle', async (title) => {
    validate.assertString(title, { max: 300, allowEmpty: true });
    const win = getWindow();
    if (win) win.setTitle(title || APP_NAME);
  });
  handle('app:confirmClose', async (allow) => {
    validate.assertBoolean(allow);
    if (!allow) return;
    allowClose = true;
    const win = getWindow();
    if (win) win.close();
  });
  handle('app:getVersion', async () => ({ name: APP_NAME, version: app.getVersion() }));
  handle('app:openExternal', async (url) => {
    validate.assertString(url, { max: 2048 });
    if (!security.isSafeExternalUrl(url)) throw new Error('invalid-url');
    await shell.openExternal(url);
  });
  handle('app:copyText', async (text) => {
    validate.assertString(text, { max: 10 * 1024 * 1024, allowEmpty: true });
    clipboard.writeText(text);
  });
}

function registerHandlers() {
  registerAppHandlers();
  fsIpc.register(ctx);
  watchIpc.register(ctx);
  searchIpc.register(ctx);
  persistenceIpc.register(ctx);
  menu.register(ctx);
}

function configureSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  // The renderer is local; nothing may leave the machine from it.
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) =>
    callback({ cancel: true }),
  );
}

function createWindow() {
  const bounds = windowState.loadBounds(ctx);
  allowClose = false;
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 360,
    minHeight: 320,
    show: false,
    title: APP_NAME,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1d23' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      navigateOnDragDrop: false,
      devTools: !app.isPackaged,
    },
  });
  const win = mainWindow;
  windowState.track(win, ctx);

  win.once('ready-to-show', () => win.show());

  // Closing asks the renderer first (unsaved changes); it answers with app:confirmClose.
  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    win.webContents.send(EVENTS.beforeClose);
  });
  win.on('unresponsive', () => {
    allowClose = true; // a hung renderer must not keep the window open
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    allowClose = true;
    log.error('renderer.gone', { reason: details && details.reason });
  });
  win.on('closed', () => {
    watchIpc.dispose();
    mainWindow = null;
  });

  win.loadFile(INDEX_HTML).catch((err) => log.error('window.load', { error: err }));
}

function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.enableSandbox();
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.on('web-contents-created', (_event, contents) => {
    security.hardenWebContents(contents, (url) => shell.openExternal(url));
  });

  app.on('window-all-closed', () => app.quit());

  app
    .whenReady()
    .then(() => {
      configureSession();
      registerHandlers();
      menu.install(ctx);
      createWindow();
      log.info('app.ready', { version: app.getVersion() });
    })
    .catch((err) => {
      log.error('app.start', { error: err });
      app.quit();
    });
}

process.on('uncaughtException', (err) => log.error('main.uncaught', { error: err }));
process.on('unhandledRejection', (reason) => log.error('main.unhandled', { error: reason }));

main();

module.exports = { APP_CHANNELS, EVENTS };
