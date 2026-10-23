// @vitest-environment jsdom
/**
 * Regression (AC-14, third report): in a real browser the Settings theme
 * select showed "Dark" while <html> kept data-theme="light" and the page
 * stayed white. React's onChange only fires for a `change` event that bubbles
 * to the React root; a select changed through an `input` event alone, or
 * through a `change` event that does not bubble (the way a browser harness
 * or `el.dispatchEvent(new Event('change'))` reports it), never reached the
 * store. These tests drive the whole chain with exactly those raw DOM events:
 * select -> store -> persisted settings -> data-theme on <html>.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { AppStoreProvider, createAppStore } from '../state/AppStore';
import { runCommand } from '../commands/registry';
import { startSessionSync } from '../state/sessionSync';
import { DEFAULT_SETTINGS, withSetting } from '../core/settings';
import type { Settings } from '../types';

function renderShell() {
  const store = createAppStore();
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  return store;
}

/** Sets the select's value the way the DOM does, then fires ONE raw event. */
function pick(select: HTMLSelectElement, value: string, event: Event) {
  act(() => {
    select.value = value;
    select.dispatchEvent(event);
  });
}

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

describe('Settings theme select with raw DOM events', () => {
  it('applies Dark and Light from a change event that does not bubble', () => {
    const store = renderShell();
    const select = screen.getByLabelText('Theme') as HTMLSelectElement;

    pick(select, 'dark', new Event('change'));
    expect(store.getState().settings.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(select.value).toBe('dark');

    pick(select, 'light', new Event('change'));
    expect(store.getState().settings.theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('applies the theme from an input event alone', () => {
    const store = renderShell();
    const select = screen.getByLabelText('Theme') as HTMLSelectElement;
    pick(select, 'dark', new Event('input', { bubbles: true }));
    expect(store.getState().settings.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies the theme once for a real pick (input then bubbling change)', () => {
    const store = renderShell();
    const select = screen.getByLabelText('Theme') as HTMLSelectElement;
    const seen: Settings[] = [];
    const off = store.subscribe(() => seen.push(store.getState().settings));
    pick(select, 'dark', new Event('input', { bubbles: true }));
    act(() => {
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    off();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(new Set(seen.map((s) => s.theme))).toEqual(new Set(['dark']));
    expect(new Set(seen).size).toBe(1);
  });

  it('commits switches changed through a non-bubbling change event', () => {
    const store = renderShell();
    const wrap = screen.getByLabelText('Word wrap') as HTMLInputElement;
    act(() => {
      wrap.checked = !store.getState().settings.wordWrap;
      wrap.dispatchEvent(new Event('change'));
    });
    expect(store.getState().settings.wordWrap).toBe(wrap.checked);
  });

  it('persists the picked theme through the settings bridge', async () => {
    vi.useFakeTimers();
    try {
      const store = createAppStore();
      const save = vi.fn(async () => undefined);
      const stop = startSessionSync({
        store,
        api: {
          settings: { load: async () => ({ ...DEFAULT_SETTINGS }), save },
          session: { load: async () => null as never, save: async () => undefined, clearRecent: async () => undefined },
        },
        openFile: async () => undefined,
        delayMs: 10,
      });
      render(
        <AppStoreProvider store={store}>
          <App />
        </AppStoreProvider>,
      );
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      pick(screen.getByLabelText('Theme') as HTMLSelectElement, 'dark', new Event('change'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
      expect(document.documentElement.dataset.theme).toBe('dark');
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the command-palette toggle in step with the select', () => {
    renderShell();
    const select = screen.getByLabelText('Theme') as HTMLSelectElement;
    pick(select, 'dark', new Event('change'));
    act(() => runCommand('view.toggleTheme'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(select.value).toBe('light');
    pick(select, 'dark', new Event('input', { bubbles: true }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('withSetting', () => {
  it('sets valid values and returns the same object for invalid or unchanged ones', () => {
    const s = { ...DEFAULT_SETTINGS };
    expect(withSetting(s, 'theme', 'dark').theme).toBe('dark');
    expect(withSetting(s, 'tabSize', '4').tabSize).toBe(4);
    expect(withSetting(s, 'wordWrap', true).wordWrap).toBe(true);
    expect(withSetting(s, 'theme', 'neon')).toBe(s);
    expect(withSetting(s, 'tabSize', '5')).toBe(s);
    expect(withSetting(s, 'tabSize', '')).toBe(s);
    expect(withSetting(s, 'wordWrap', 'yes')).toBe(s);
    expect(withSetting(s, 'unknown', 'x')).toBe(s);
    expect(withSetting(s, 'theme', s.theme)).toBe(s);
  });
});
