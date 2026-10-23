'use strict';
/**
 * Native application menu (File, Edit, View, Help). Every item sends its
 * command id to the renderer over the app:onMenuCommand event, so the menu
 * triggers exactly the same commands as the shortcuts. app:setMenuState keeps
 * the Word Wrap and theme check marks in sync.
 *
 * The accelerators are shown next to the items but NOT registered with the
 * operating system (registerAccelerator: false): the renderer's global
 * keybindings (src/commands/keybindings.ts) already run the command for the
 * key, so a registered accelerator would run it a second time. A chord such
 * as "Ctrl+K Ctrl+O" cannot be an Electron accelerator at all and is shown
 * without one.
 */

const CHANNELS = ['app:setMenuState'];

/** Event channel main → renderer carrying a command id. */
const MENU_COMMAND_EVENT = 'app:onMenuCommand';

/**
 * Shortcuts of the commands, in the display form of COMMANDS
 * (src/commands/registry.ts). The main process cannot import the renderer's
 * TypeScript, so menu.test.ts checks that this table matches COMMANDS.
 */
const SHORTCUTS = {
  'file.openFolder': 'Ctrl+K Ctrl+O',
  'file.save': 'Ctrl+S',
  'file.saveAs': 'Ctrl+Shift+S',
  'tab.close': 'Ctrl+W',
  'tab.next': 'Ctrl+Tab',
  'tab.prev': 'Ctrl+Shift+Tab',
  'view.quickOpen': 'Ctrl+P',
  'view.palette': 'Ctrl+Shift+P',
  'view.goToLine': 'Ctrl+G',
  'view.find': 'Ctrl+F',
  'view.replace': 'Ctrl+H',
  'view.workspaceSearch': 'Ctrl+Shift+F',
  'view.zoomIn': 'Ctrl+Plus',
  'view.zoomOut': 'Ctrl+Minus',
  'view.zoomReset': 'Ctrl+0',
  'editor.toggleComment': 'Ctrl+/',
  'editor.moveLineUp': 'Alt+Up',
  'editor.moveLineDown': 'Alt+Down',
  'editor.selectNext': 'Ctrl+D',
};

/** Check-mark items: command id → the MenuState field that decides `checked`. */
const CHECK_ITEMS = {
  'view.toggleWordWrap': (state) => state.wordWrap === true,
  'view.toggleTheme': (state) => state.theme === 'dark',
};

/**
 * The menu layout. A string is a role of Electron's own (clipboard, undo),
 * 'separator' a separator, an object a command item.
 */
const MENU_LAYOUT = [
  {
    label: '&File',
    items: [
      { id: 'file.openFolder', label: 'Open &Folder…' },
      { id: 'file.openFile', label: '&Open File…' },
      'separator',
      { id: 'file.save', label: '&Save' },
      { id: 'file.saveAs', label: 'Save &As…' },
      { id: 'file.saveAll', label: 'Save A&ll' },
      'separator',
      { id: 'tab.close', label: '&Close Tab' },
      { id: 'tab.next', label: '&Next Tab' },
      { id: 'tab.prev', label: '&Previous Tab' },
      'separator',
      'quit',
    ],
  },
  {
    label: '&Edit',
    items: [
      'undo',
      'redo',
      'separator',
      'cut',
      'copy',
      'paste',
      'selectAll',
      'separator',
      { id: 'view.find', label: '&Find' },
      { id: 'view.replace', label: '&Replace' },
      'separator',
      { id: 'editor.toggleComment', label: 'Toggle Line &Comment' },
      { id: 'editor.moveLineUp', label: 'Move Line &Up' },
      { id: 'editor.moveLineDown', label: 'Move Line &Down' },
      { id: 'editor.duplicateLine', label: 'D&uplicate Line' },
      { id: 'editor.selectNext', label: 'Select &Next Occurrence' },
    ],
  },
  {
    label: '&View',
    items: [
      { id: 'view.quickOpen', label: '&Quick Open…' },
      { id: 'view.palette', label: '&Command Palette…' },
      { id: 'view.goToLine', label: '&Go to Line…' },
      { id: 'view.workspaceSearch', label: '&Search in Workspace' },
      'separator',
      { id: 'view.toggleTheme', label: '&Dark Theme' },
      { id: 'view.toggleWordWrap', label: '&Word Wrap' },
      'separator',
      { id: 'view.zoomIn', label: 'Zoom &In' },
      { id: 'view.zoomOut', label: 'Zoom &Out' },
      { id: 'view.zoomReset', label: '&Reset Zoom' },
      'separator',
      { id: 'editor.changeLanguage', label: 'Change &Language Mode…' },
      { id: 'editor.changeIndent', label: 'Change I&ndentation…' },
      { id: 'editor.toggleEol', label: 'Toggle Line &Ending (LF/CRLF)' },
      'separator',
      { id: 'view.settings', label: 'Se&ttings' },
    ],
  },
  {
    label: '&Help',
    items: [{ id: 'help.about', label: '&About Code Editor' }],
  },
];

const DEFAULT_STATE = { wordWrap: false, theme: 'light' };

/**
 * Turns a display shortcut ("Ctrl+Shift+P", "Ctrl+Minus") into an Electron
 * accelerator; null for a chord or an empty shortcut.
 */
function toAccelerator(shortcut) {
  if (typeof shortcut !== 'string' || shortcut.trim() === '' || /\s/.test(shortcut.trim())) return null;
  return shortcut
    .trim()
    .split('+')
    .map((part) => (part === 'Minus' ? '-' : part))
    .join('+');
}

/** Every command id the menu sends, in menu order. */
function menuCommandIds(layout = MENU_LAYOUT) {
  const ids = [];
  for (const menu of layout) {
    for (const item of menu.items) if (item && typeof item === 'object') ids.push(item.id);
  }
  return ids;
}

/**
 * Builds the Electron menu template.
 * @param send     (commandId) => void, called when an item is chosen
 * @param state    the current MenuState (check marks)
 * @param options  { devTools: boolean } adds Reload/Toggle Developer Tools to View
 */
function buildTemplate(send, state = DEFAULT_STATE, options = {}) {
  return MENU_LAYOUT.map((menu) => {
    const submenu = menu.items.map((item) => {
      if (item === 'separator') return { type: 'separator' };
      if (typeof item === 'string') return { role: item };
      const entry = {
        id: item.id,
        label: item.label,
        click: (menuItem) => {
          // A check mark only changes once the renderer reports the new state.
          if (CHECK_ITEMS[item.id] && menuItem) menuItem.checked = CHECK_ITEMS[item.id](currentState);
          send(item.id);
        },
      };
      const accelerator = toAccelerator(SHORTCUTS[item.id]);
      if (accelerator) {
        entry.accelerator = accelerator;
        entry.registerAccelerator = false;
      }
      if (CHECK_ITEMS[item.id]) {
        entry.type = 'checkbox';
        entry.checked = CHECK_ITEMS[item.id](state);
      }
      return entry;
    });
    if (menu.label === '&View' && options.devTools) {
      submenu.push({ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' });
    }
    return { label: menu.label, submenu };
  });
}

let currentState = { ...DEFAULT_STATE };
let currentMenu = null;

/** Applies a MenuState to the installed menu's check marks. */
function applyState(menu, state) {
  if (!menu || typeof menu.getMenuItemById !== 'function') return;
  for (const [id, isChecked] of Object.entries(CHECK_ITEMS)) {
    const item = menu.getMenuItemById(id);
    if (item) item.checked = isChecked(state);
  }
}

/** @param ctx the handler context documented in electron/main.cjs */
function register(ctx) {
  ctx.handle('app:setMenuState', async (state) => {
    ctx.validate.assertMenuState(state);
    currentState = { wordWrap: state.wordWrap, theme: state.theme };
    applyState(currentMenu, currentState);
  });
}

/** Builds and installs the native menu. */
function install(ctx) {
  const { Menu, app } = ctx.electron;
  try {
    const template = buildTemplate((id) => ctx.send(MENU_COMMAND_EVENT, id), currentState, {
      devTools: !(app && app.isPackaged),
    });
    currentMenu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(currentMenu);
  } catch (err) {
    // Without the custom menu the window still opens; the shortcuts keep working.
    ctx.log.error('menu.install', { error: err });
  }
}

module.exports = {
  CHANNELS,
  MENU_COMMAND_EVENT,
  SHORTCUTS,
  MENU_LAYOUT,
  toAccelerator,
  menuCommandIds,
  buildTemplate,
  register,
  install,
};
