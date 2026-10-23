/**
 * Every app command, listed once. The command palette, the in-page menu bar,
 * the global keybindings and the native menu (via app.onMenuCommand) all run
 * commands by id through runCommand(); feature modules attach the behaviour
 * with registerHandler().
 */
export interface Command {
  id: string;
  title: string;
  /** Display form, e.g. "Ctrl+Shift+P" or the chord "Ctrl+K Ctrl+O". */
  shortcut?: string;
}

export const COMMANDS: Command[] = [
  { id: 'file.openFolder', title: 'File: Open Folder', shortcut: 'Ctrl+K Ctrl+O' },
  { id: 'file.openFile', title: 'File: Open File' },
  { id: 'file.save', title: 'File: Save', shortcut: 'Ctrl+S' },
  { id: 'file.saveAs', title: 'File: Save As', shortcut: 'Ctrl+Shift+S' },
  { id: 'file.saveAll', title: 'File: Save All' },
  { id: 'tab.close', title: 'Tab: Close Tab', shortcut: 'Ctrl+W' },
  { id: 'tab.next', title: 'Tab: Next Tab', shortcut: 'Ctrl+Tab' },
  { id: 'tab.prev', title: 'Tab: Previous Tab', shortcut: 'Ctrl+Shift+Tab' },
  { id: 'view.quickOpen', title: 'View: Quick Open', shortcut: 'Ctrl+P' },
  { id: 'view.palette', title: 'View: Command Palette', shortcut: 'Ctrl+Shift+P' },
  { id: 'view.goToLine', title: 'View: Go to Line', shortcut: 'Ctrl+G' },
  { id: 'view.find', title: 'Edit: Find', shortcut: 'Ctrl+F' },
  { id: 'view.replace', title: 'Edit: Replace', shortcut: 'Ctrl+H' },
  { id: 'view.workspaceSearch', title: 'View: Search in Workspace', shortcut: 'Ctrl+Shift+F' },
  { id: 'view.toggleTheme', title: 'View: Toggle Theme' },
  { id: 'view.toggleWordWrap', title: 'View: Toggle Word Wrap' },
  { id: 'view.zoomIn', title: 'View: Zoom In', shortcut: 'Ctrl+Plus' },
  { id: 'view.zoomOut', title: 'View: Zoom Out', shortcut: 'Ctrl+Minus' },
  { id: 'view.zoomReset', title: 'View: Reset Zoom', shortcut: 'Ctrl+0' },
  { id: 'view.settings', title: 'View: Open Settings' },
  { id: 'editor.changeLanguage', title: 'Editor: Change Language Mode' },
  { id: 'editor.changeIndent', title: 'Editor: Change Indentation' },
  { id: 'editor.toggleEol', title: 'Editor: Toggle Line Ending (LF/CRLF)' },
  { id: 'editor.toggleComment', title: 'Editor: Toggle Line Comment', shortcut: 'Ctrl+/' },
  { id: 'editor.moveLineUp', title: 'Editor: Move Line Up', shortcut: 'Alt+Up' },
  { id: 'editor.moveLineDown', title: 'Editor: Move Line Down', shortcut: 'Alt+Down' },
  { id: 'editor.duplicateLine', title: 'Editor: Duplicate Line' },
  { id: 'editor.selectNext', title: 'Editor: Select Next Occurrence', shortcut: 'Ctrl+D' },
  { id: 'help.about', title: 'Help: About' },
];

export type CommandHandler = (arg?: unknown) => void;

const handlers = new Map<string, CommandHandler>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of [...listeners]) l();
}

export function getCommand(id: string): Command | undefined {
  return COMMANDS.find((c) => c.id === id);
}

/**
 * Attaches the behaviour of a command. A later registration for the same id
 * replaces the earlier one. Returns a function that removes this handler
 * (only if it is still the registered one).
 */
export function registerHandler(id: string, fn: CommandHandler): () => void {
  handlers.set(id, fn);
  notify();
  return () => {
    if (handlers.get(id) === fn) {
      handlers.delete(id);
      notify();
    }
  };
}

export function hasHandler(id: string): boolean {
  return handlers.has(id);
}

/** Observes handler (un)registration, e.g. to enable menu entries. */
export function onHandlersChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs a command. Returns true when a handler ran, false when no handler is
 * registered for the id. A failing (or rejecting) handler is reported with
 * the command id and a short error name only — never file contents or paths.
 */
export function runCommand(id: string, arg?: unknown): boolean {
  const fn = handlers.get(id);
  if (!fn) return false;
  const report = (err: unknown) => {
    let code = 'unknown-error';
    if (err instanceof Error) code = /^[a-z][a-z0-9-]{0,40}$/i.test(err.message) ? err.message : err.name;
    console.error(`[command] ${id} failed: ${code}`);
  };
  try {
    const result: unknown = fn(arg);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(undefined, report);
    }
  } catch (err) {
    report(err);
  }
  return true;
}
