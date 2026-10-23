import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { AppStoreProvider, createAppStore } from '../state/AppStore';
import { openFile } from '../state/openFile';
import { api } from '../platform';
import { runCommand } from '../commands/registry';
import { getActiveView } from '../editor/keymaps';
import { TabBar } from './TabBar';
import { EditorPane } from './EditorPane';
import { SavePrompt } from './SavePrompt';
import { TabItem } from '../ui/Tab';

// jsdom has no layout: CodeMirror's measuring needs these Range methods to exist.
if (typeof Range !== 'undefined') {
  const empty = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= empty;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 0, 0, 0);
}

/** The marker the QA check looks for INSIDE a tab element. */
const MARKER = '[class*="dirty"], [aria-label*="unsaved" i], [title*="unsaved" i], [aria-label*="modified" i], [title*="modified" i]';

const README = 'C:\\w\\README.md';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('dirty marker inside the tab', () => {
  it('a clean tab has no marker; a dirty one has a dot named "Unsaved changes"', () => {
    const { rerender } = render(<TabItem name="README.md" testId="tab" />);
    expect(screen.getByTestId('tab').querySelector(MARKER)).toBeNull();
    rerender(<TabItem name="README.md" testId="tab" dirty />);
    const dot = screen.getByTestId('tab').querySelector('.tab-dot');
    expect(dot?.className).toContain('dirty');
    expect(dot?.getAttribute('aria-label')).toBe('Unsaved changes');
    expect(dot?.getAttribute('title')).toBe('Unsaved changes');
    expect(screen.getByRole('tab').textContent).toContain('(unsaved)');
  });

  // Regression (AC-04, AC-07): the dirty state was set, but only the tab
  // element carried `is-dirty`; nothing inside the tab named the unsaved
  // state, so a marker looked up within the tab was never found.
  it('typing in README.md shows the marker within its tab, Ctrl+S (file.save) removes it', async () => {
    vi.spyOn(api.fs, 'readFile').mockImplementation(async () => ({ content: '# Demo\n', eol: 'lf', size: 7, tooLarge: false }));
    vi.spyOn(api.fs, 'writeFile').mockImplementation(async () => undefined);
    const store = createAppStore();
    render(
      <AppStoreProvider store={store}>
        <TabBar />
        <EditorPane />
        <SavePrompt />
      </AppStoreProvider>,
    );
    await act(async () => {
      await openFile(README, { preview: true }, store);
    });
    const tab = () => screen.getByTestId('tab-README.md');
    expect(tab().querySelector(MARKER)).toBeNull();

    const view = getActiveView();
    if (!view) throw new Error('no view');
    act(() => {
      view.dispatch({ changes: { from: 0, insert: 'hello' }, userEvent: 'input.type' });
    });
    expect(tab().querySelector('[aria-label="Unsaved changes"]')).toBeTruthy();
    expect(tab().querySelector(MARKER)).toBeTruthy();

    await act(async () => {
      runCommand('file.save');
    });
    await waitFor(() => expect(tab().querySelector(MARKER)).toBeNull());
    expect(tab().className).not.toContain('dirty');
  });
});
