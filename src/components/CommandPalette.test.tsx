import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CommandPalette, filterCommands } from './CommandPalette';
import { GoToLine, validateLine } from './GoToLine';
import { AppStoreProvider, createAppStore, createInitialState } from '../state/AppStore';
import { COMMANDS, registerHandler, runCommand } from '../commands/registry';
import { setActiveView } from '../editor/keymaps';

function setup() {
  const store = createAppStore(createInitialState());
  render(
    <AppStoreProvider store={store}>
      <CommandPalette />
      <GoToLine />
    </AppStoreProvider>,
  );
  return store;
}

const rowTitles = () => screen.queryAllByTestId('command-palette-row').map((r) => r.querySelector('.qp-title')?.textContent);

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanup();
  while (cleanups.length) cleanups.pop()?.();
  setActiveView(null);
  vi.restoreAllMocks();
});

describe('filterCommands', () => {
  it('lists every command for an empty query', () => {
    expect(filterCommands('')).toEqual(COMMANDS);
    expect(filterCommands('   ')).toHaveLength(COMMANDS.length);
  });

  it('filters fuzzily and ranks the best match first', () => {
    const result = filterCommands('gotoline');
    expect(result[0].id).toBe('view.goToLine');
    expect(result.length).toBeLessThan(COMMANDS.length);
    expect(filterCommands('zoom in')[0].id).toBe('view.zoomIn');
  });

  it('returns nothing for a query no title contains', () => {
    expect(filterCommands('qqqxxz')).toEqual([]);
  });
});

describe('CommandPalette', () => {
  it('opens via view.palette and lists all commands with shortcuts', () => {
    const store = setup();
    act(() => {
      expect(runCommand('view.palette')).toBe(true);
    });
    expect(store.getState().overlay).toBe('palette');
    expect(rowTitles()).toHaveLength(COMMANDS.length);
    const paletteRow = screen.getAllByTestId('command-palette-row').find((r) => r.textContent?.includes('Command Palette'));
    expect(paletteRow?.querySelectorAll('kbd')).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByTestId('command-palette-input'));
  });

  it('filters while typing and runs the selected command on Enter', () => {
    const store = setup();
    const ran = vi.fn();
    cleanups.push(registerHandler('view.toggleWordWrap', ran));
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'palette' }));
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'word wrap' } });
    expect(rowTitles()[0]).toBe('View: Toggle Word Wrap');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ran).toHaveBeenCalledTimes(1);
    expect(store.getState().overlay).toBeNull();
  });

  it('shows commands without a handler disabled and does not run them', () => {
    const store = setup();
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'palette' }));
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'change indentation' } });
    const row = screen.getAllByTestId('command-palette-row')[0];
    expect(row.textContent).toContain('Change Indentation');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.getState().overlay).toBe('palette');
  });

  it('enables a row as soon as its handler is registered', () => {
    const store = setup();
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'palette' }));
    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: 'change indentation' } });
    expect(screen.getAllByTestId('command-palette-row')[0].getAttribute('aria-disabled')).toBe('true');
    act(() => {
      cleanups.push(registerHandler('editor.changeIndent', () => undefined));
    });
    expect(screen.getAllByTestId('command-palette-row')[0].getAttribute('aria-disabled')).toBeNull();
  });

  it('moves the selection with the arrow keys, shows the empty state and closes on Escape', () => {
    const store = setup();
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'palette' }));
    const input = screen.getByTestId('command-palette-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByTestId('command-palette-row')[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.change(input, { target: { value: 'qqqxxz' } });
    expect(screen.getByText('No matching commands')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(store.getState().overlay).toBeNull();
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });
});

describe('validateLine', () => {
  it('accepts lines in range and names the error otherwise', () => {
    expect(validateLine('', 10)).toBeNull();
    expect(validateLine(' 7 ', 10)).toEqual({ line: 7 });
    expect(validateLine('abc', 10)).toEqual({ error: 'Enter a line number' });
    expect(validateLine('0', 10)).toEqual({ error: 'Line must be between 1 and 10' });
    expect(validateLine('11', 10)).toEqual({ error: 'Line must be between 1 and 10' });
  });
});

describe('GoToLine', () => {
  function mountView() {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n');
    const view = new EditorView({ state: EditorState.create({ doc }), parent });
    setActiveView(view);
    cleanups.push(() => {
      view.destroy();
      parent.remove();
    });
    return view;
  }

  it('starts neutral, validates after typing and jumps on Enter', () => {
    const view = mountView();
    const store = setup();
    act(() => {
      expect(runCommand('view.goToLine')).toBe(true);
    });
    const input = screen.getByTestId('go-to-line-input');
    expect(document.activeElement).toBe(input);
    expect(screen.getByText(/Current line: 1\. Type a line number between 1 and 40/)).toBeTruthy();
    expect(screen.queryByTestId('go-to-line-error')).toBeNull();

    fireEvent.change(input, { target: { value: '99' } });
    expect(screen.getByTestId('go-to-line-error').textContent).toBe('Line must be between 1 and 40');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.getState().overlay).toBe('goToLine');

    fireEvent.change(input, { target: { value: '25' } });
    expect(screen.queryByTestId('go-to-line-error')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.getState().overlay).toBeNull();
    const head = view.state.selection.main.head;
    expect(view.state.doc.lineAt(head).number).toBe(25);
    expect(head).toBe(view.state.doc.line(25).from);
  });

  it('explains that a file is needed when no editor is active', () => {
    const store = setup();
    act(() => store.dispatch({ type: 'overlay/set', overlay: 'goToLine' }));
    expect(screen.getByText('Open a file to go to a line.')).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('go-to-line-input'), { key: 'Escape' });
    expect(store.getState().overlay).toBeNull();
  });
});

describe('nextSelection', () => {
  it('wraps with the arrows and clamps with the page keys', async () => {
    const { nextSelection } = await import('./CommandPalette');
    expect(nextSelection('ArrowDown', 4, 5)).toBe(0);
    expect(nextSelection('ArrowUp', 0, 5)).toBe(4);
    expect(nextSelection('PageDown', 2, 5)).toBe(4);
    expect(nextSelection('PageUp', 2, 5)).toBe(0);
    expect(nextSelection('a', 2, 5)).toBeNull();
  });
});
