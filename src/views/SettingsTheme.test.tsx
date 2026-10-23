// @vitest-environment jsdom
/**
 * Regression (AC-14): choosing a theme in the Settings view applies it to the
 * document at once and it stays applied — also when the choice is made while
 * the stored settings are still being restored on start.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { AppStoreProvider, createAppStore } from '../state/AppStore';
import { runCommand } from '../commands/registry';
import { SAVE_DEBOUNCE_MS } from '../state/sessionSync';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function renderShell() {
  const store = createAppStore();
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  return store;
}

/** Lets the start-up restore (settings.load / session.load) and the debounced save settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 100));
  });
}

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

describe('theme from the Settings view', () => {
  it('applies Dark to the document immediately and keeps it after start-up restore', async () => {
    const store = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    expect(document.documentElement.dataset.theme).toBe('dark');

    await settle();
    expect(store.getState().settings.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('dark');
  });

  it('switches back to Light from the Settings view', async () => {
    const store = renderShell();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(store.getState().settings.theme).toBe('light');
  });

  it('keeps the command-palette theme toggle working', async () => {
    const store = renderShell();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } });
    act(() => runCommand('view.toggleTheme'));
    expect(store.getState().settings.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('gives the window background the dark token when data-theme is dark', () => {
    // read from disk: the vitest config (css: false) hands `?raw` imports of CSS over empty
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8').replace(/\s+/g, ' ');
    expect(css).toMatch(/:root\[data-theme="dark"\][^{]*\{[^}]*--c-bg: #1a1d23;/);
    expect(css).toMatch(/:root, \.theme-light \{[^}]*--c-bg: #ffffff;/);
    expect(css).toMatch(/body \{[^}]*background: var\(--c-bg\);/);
  });
});
