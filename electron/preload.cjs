'use strict';
/**
 * Preload (sandboxed): exposes EXACTLY the methods of the typed bridge
 * (`interface Api` in src/platform.ts) as window.api via contextBridge.
 * No generic ipcRenderer, no fs, no Node APIs reach the renderer (AC-18,
 * AC-22). Every call is invoke/handle on the channel `<group>:<method>`;
 * a rejection carries only the short error code from the main process.
 */
const { contextBridge, ipcRenderer } = require('electron');

/** Electron wraps remote errors as "Error invoking remote method 'x': Error: code". */
function toCodeError(err) {
  const message = err && typeof err.message === 'string' ? err.message : '';
  const match = /([a-z][a-z0-9-]{0,40})$/.exec(message);
  return new Error(match ? match[1] : 'ipc-failed');
}

function invoke(channel) {
  return (...args) => ipcRenderer.invoke(channel, ...args).catch((err) => Promise.reject(toCodeError(err)));
}

/** Subscribes a renderer callback to a main → renderer event; returns the unsubscribe function. */
function subscribe(channel, cb) {
  if (typeof cb !== 'function') throw new Error('invalid-argument');
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

/* The window asks before it closes; without a listener there is nothing to protect, so it closes. */
const beforeCloseListeners = new Set();
ipcRenderer.on('app:onBeforeClose', () => {
  if (beforeCloseListeners.size === 0) {
    ipcRenderer.invoke('app:confirmClose', true).catch((err) => {
      console.error('[preload] confirmClose failed:', toCodeError(err).message);
    });
    return;
  }
  for (const cb of [...beforeCloseListeners]) cb();
});

const api = {
  fs: {
    openFolderDialog: invoke('fs:openFolderDialog'),
    openFileDialog: invoke('fs:openFileDialog'),
    saveAsDialog: invoke('fs:saveAsDialog'),
    readDir: invoke('fs:readDir'),
    listFiles: invoke('fs:listFiles'),
    readFile: invoke('fs:readFile'),
    writeFile: invoke('fs:writeFile'),
    createFile: invoke('fs:createFile'),
    createDir: invoke('fs:createDir'),
    rename: invoke('fs:rename'),
    trash: invoke('fs:trash'),
    reveal: invoke('fs:reveal'),
    stat: invoke('fs:stat'),
    watch: invoke('fs:watch'),
    unwatch: invoke('fs:unwatch'),
    onChange: (cb) => subscribe('fs:onChange', cb),
  },
  search: {
    run: invoke('search:run'),
    cancel: invoke('search:cancel'),
  },
  settings: {
    load: invoke('settings:load'),
    save: invoke('settings:save'),
  },
  session: {
    load: invoke('session:load'),
    save: invoke('session:save'),
    clearRecent: invoke('session:clearRecent'),
  },
  app: {
    setTitle: invoke('app:setTitle'),
    onMenuCommand: (cb) => subscribe('app:onMenuCommand', cb),
    onBeforeClose: (cb) => {
      if (typeof cb !== 'function') throw new Error('invalid-argument');
      beforeCloseListeners.add(cb);
      return () => {
        beforeCloseListeners.delete(cb);
      };
    },
    confirmClose: invoke('app:confirmClose'),
    getVersion: invoke('app:getVersion'),
    openExternal: invoke('app:openExternal'),
    copyText: invoke('app:copyText'),
    setMenuState: invoke('app:setMenuState'),
  },
};

contextBridge.exposeInMainWorld('api', api);
