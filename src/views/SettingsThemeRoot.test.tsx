// @vitest-environment jsdom
/**
 * Regression (AC-14, repeated bug): picking Dark in the Settings theme select
 * must turn the background of the document ROOT dark at once, and Light must
 * turn it light again. The root (<html>) used to carry no background of its
 * own, so a check of the root's colour found it unchanged (falling back to
 * the white window canvas) although <body> had switched.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import App from '../App';
import { AppStoreProvider, createAppStore } from '../state/AppStore';
import { runCommand } from '../commands/registry';

const CSS = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
const flat = CSS.replace(/\s+/g, ' ');

/** The value of one token in the block that starts with `selector {`. */
function token(selector: string, name: string): string {
  const start = flat.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const block = flat.slice(start, flat.indexOf('}', start));
  const m = block.match(new RegExp(`${name}: ([^;]+);`));
  expect(m).not.toBeNull();
  return (m as RegExpMatchArray)[1].trim();
}

const LIGHT_BG = token(':root, .theme-light', '--c-bg');
const DARK_BG = token(':root[data-theme="dark"], .theme-dark', '--c-bg');

/** The background the stylesheet gives the root for the theme now set on it (var() resolved by hand). */
function rootBackground(): string {
  return document.documentElement.dataset.theme === 'dark' ? DARK_BG : LIGHT_BG;
}

function renderShell() {
  const store = createAppStore();
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  return store;
}

beforeAll(() => {
  expect(LIGHT_BG.toLowerCase()).toBe('#ffffff');
  expect(DARK_BG.toLowerCase()).toBe('#1a1d23');
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

describe('theme on the document root', () => {
  it('paints the root, body, #root and the app container with the theme background', () => {
    for (const selector of ['html', 'body', '#root', '.app']) {
      const re = new RegExp(`(^|[ }])${selector.replace('.', '\\.')} \\{[^}]*background: var\\(--c-bg\\);`);
      expect(flat, `${selector} carries var(--c-bg)`).toMatch(re);
    }
  });

  it('turns the root dark when Dark is picked in Settings and light again for Light', () => {
    const store = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const select = screen.getByLabelText('Theme') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['System', 'Dark', 'Light']);

    fireEvent.change(select, { target: { value: 'dark' } });
    expect(store.getState().settings.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(rootBackground()).toBe(DARK_BG);

    fireEvent.change(select, { target: { value: 'light' } });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(rootBackground()).toBe(LIGHT_BG);
  });

  it('shows Dark even while the OS colour scheme is light, and Light while it is dark', () => {
    const original = window.matchMedia;
    for (const systemDark of [false, true]) {
      window.matchMedia = ((q: string) => ({
        matches: systemDark,
        media: q,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
      renderShell();
      expect(document.documentElement.dataset.theme).toBe(systemDark ? 'dark' : 'light');
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      const select = screen.getByLabelText('Theme');
      fireEvent.change(select, { target: { value: systemDark ? 'light' : 'dark' } });
      expect(document.documentElement.dataset.theme).toBe(systemDark ? 'light' : 'dark');
      cleanup();
    }
    window.matchMedia = original;
  });

  it('keeps the command-palette toggle switching the root theme', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    act(() => runCommand('view.toggleTheme'));
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => runCommand('view.toggleTheme'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('dark');
  });
});
