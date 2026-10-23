import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS, getCommand, hasHandler, onHandlersChanged, registerHandler, runCommand } from './registry';
import {
  chordMatches,
  createKeybindingDispatcher,
  eventToChord,
  installKeybindings,
  parseShortcut,
  type KeyEventLike,
} from './keybindings';

const CONTRACT_IDS = [
  'file.openFolder',
  'file.save',
  'file.saveAs',
  'file.saveAll',
  'tab.close',
  'tab.next',
  'tab.prev',
  'view.quickOpen',
  'view.palette',
  'view.goToLine',
  'view.find',
  'view.replace',
  'view.workspaceSearch',
  'view.toggleTheme',
  'view.toggleWordWrap',
  'view.zoomIn',
  'view.zoomOut',
  'view.zoomReset',
  'view.settings',
  'editor.changeLanguage',
  'editor.changeIndent',
  'editor.toggleEol',
  'editor.toggleComment',
  'editor.moveLineUp',
  'editor.moveLineDown',
  'editor.duplicateLine',
  'editor.selectNext',
  'help.about',
];

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function key(k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key: k, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods };
}

describe('COMMANDS', () => {
  it('has unique ids', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists every command of the sprint contract', () => {
    const ids = new Set(COMMANDS.map((c) => c.id));
    for (const id of CONTRACT_IDS) expect(ids.has(id)).toBe(true);
  });

  it('gives every command a title and only parseable shortcuts, each bound once', () => {
    const seen = new Set<string>();
    for (const c of COMMANDS) {
      expect(c.title.length).toBeGreaterThan(0);
      if (!c.shortcut) continue;
      const chords = parseShortcut(c.shortcut);
      expect(chords.length).toBeGreaterThan(0);
      for (const chord of chords) expect(chord.key).not.toBe('');
      expect(seen.has(c.shortcut)).toBe(false);
      seen.add(c.shortcut);
    }
  });

  it('carries the shortcuts the spec promises', () => {
    expect(getCommand('file.openFolder')?.shortcut).toBe('Ctrl+K Ctrl+O');
    expect(getCommand('view.quickOpen')?.shortcut).toBe('Ctrl+P');
    expect(getCommand('view.palette')?.shortcut).toBe('Ctrl+Shift+P');
    expect(getCommand('view.workspaceSearch')?.shortcut).toBe('Ctrl+Shift+F');
    expect(getCommand('file.save')?.shortcut).toBe('Ctrl+S');
  });
});

describe('registry', () => {
  it('runs a registered handler with its argument and reports whether one ran', () => {
    const fn = vi.fn();
    cleanups.push(registerHandler('view.goToLine', fn));
    expect(hasHandler('view.goToLine')).toBe(true);
    expect(runCommand('view.goToLine', 12)).toBe(true);
    expect(fn).toHaveBeenCalledWith(12);
    expect(runCommand('no.such.command')).toBe(false);
  });

  it('unregisters only its own handler', () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = registerHandler('view.find', first);
    const offSecond = registerHandler('view.find', second);
    offFirst();
    expect(hasHandler('view.find')).toBe(true);
    runCommand('view.find');
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    offSecond();
    expect(hasHandler('view.find')).toBe(false);
  });

  it('notifies observers when handlers change', () => {
    const listener = vi.fn();
    cleanups.push(onHandlersChanged(listener));
    const off = registerHandler('view.replace', () => undefined);
    off();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reports a failing handler with a short code instead of throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cleanups.push(() => spy.mockRestore());
    cleanups.push(
      registerHandler('view.zoomIn', () => {
        throw new Error('boom-code');
      }),
    );
    expect(runCommand('view.zoomIn')).toBe(true);
    expect(spy).toHaveBeenCalledWith('[command] view.zoomIn failed: boom-code');
  });
});

describe('keybindings', () => {
  it('parses single shortcuts and chords', () => {
    expect(parseShortcut('Ctrl+Shift+P')).toEqual([{ ctrl: true, shift: true, alt: false, meta: false, key: 'p' }]);
    expect(parseShortcut('Ctrl+K Ctrl+O')).toHaveLength(2);
    expect(parseShortcut('Alt+Up')[0]).toMatchObject({ alt: true, key: 'up' });
    expect(parseShortcut('Ctrl+Plus')[0].key).toBe('plus');
  });

  it('normalises key events', () => {
    expect(eventToChord(key('P', { ctrlKey: true, shiftKey: true }))?.key).toBe('p');
    expect(eventToChord(key('ArrowUp', { altKey: true }))?.key).toBe('up');
    expect(eventToChord(key('=', { ctrlKey: true }))?.key).toBe('plus');
    expect(eventToChord(key('Control', { ctrlKey: true }))).toBeNull();
    // a non-latin layout falls back to the physical key
    expect(eventToChord({ ...key('з', { ctrlKey: true }), code: 'KeyP' })?.key).toBe('p');
  });

  it('accepts Shift for symbol keys that need it on some layouts', () => {
    const [bound] = parseShortcut('Ctrl+/');
    expect(chordMatches(bound, eventToChord(key('/', { ctrlKey: true, shiftKey: true }))!)).toBe(true);
    const [letter] = parseShortcut('Ctrl+P');
    expect(chordMatches(letter, eventToChord(key('P', { ctrlKey: true, shiftKey: true }))!)).toBe(false);
  });

  it('dispatches a shortcut to its registered handler', () => {
    const fn = vi.fn();
    cleanups.push(registerHandler('view.quickOpen', fn));
    const d = createKeybindingDispatcher();
    const result = d.handleKeyDown(key('p', { ctrlKey: true }));
    expect(result).toEqual({ handled: true, commandId: 'view.quickOpen', pending: false });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('leaves keys alone whose command has no handler', () => {
    const d = createKeybindingDispatcher();
    expect(d.handleKeyDown(key('g', { ctrlKey: true })).handled).toBe(false);
    expect(d.handleKeyDown(key('a')).handled).toBe(false);
  });

  it('dispatches the chord Ctrl+K Ctrl+O', () => {
    const fn = vi.fn();
    cleanups.push(registerHandler('file.openFolder', fn));
    const d = createKeybindingDispatcher();
    expect(d.handleKeyDown(key('k', { ctrlKey: true }))).toEqual({ handled: true, commandId: null, pending: true });
    expect(fn).not.toHaveBeenCalled();
    // releasing / pressing the modifier alone keeps the chord pending
    expect(d.handleKeyDown(key('Control', { ctrlKey: true })).pending).toBe(true);
    expect(d.handleKeyDown(key('o', { ctrlKey: true })).commandId).toBe('file.openFolder');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('swallows the second key of an unknown chord and expires a stale chord', () => {
    const open = vi.fn();
    const save = vi.fn();
    cleanups.push(registerHandler('file.openFolder', open));
    cleanups.push(registerHandler('file.save', save));
    let now = 0;
    const d = createKeybindingDispatcher({ now: () => now, chordTimeoutMs: 1000 });
    d.handleKeyDown(key('k', { ctrlKey: true }));
    expect(d.handleKeyDown(key('s', { ctrlKey: true }))).toEqual({ handled: true, commandId: null, pending: false });
    expect(save).not.toHaveBeenCalled();

    d.handleKeyDown(key('k', { ctrlKey: true }));
    now = 5000;
    expect(d.handleKeyDown(key('s', { ctrlKey: true })).commandId).toBe('file.save');
    expect(open).not.toHaveBeenCalled();
  });

  it('installs a capture listener that prevents the default of handled keys only', () => {
    const fn = vi.fn();
    cleanups.push(registerHandler('view.workspaceSearch', fn));
    const target = new EventTarget();
    const uninstall = installKeybindings(target as unknown as Window);
    const handled = new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, cancelable: true });
    target.dispatchEvent(handled);
    const ignored = new KeyboardEvent('keydown', { key: 'x', cancelable: true });
    target.dispatchEvent(ignored);
    uninstall();
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(handled.defaultPrevented).toBe(true);
    expect(ignored.defaultPrevented).toBe(false);
  });
});
