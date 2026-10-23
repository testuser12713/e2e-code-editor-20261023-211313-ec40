import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppStoreProvider, createAppStore, createInitialState, type AppStoreHandle } from '../state/AppStore';
import { AboutDialog, ABOUT_DESCRIPTION, ZOOM_MAX, ZOOM_MIN, zoomFontSize } from './AboutDialog';
import { registerHandler, runCommand } from '../commands/registry';
import { api } from '../platform';
import { DEFAULT_SETTINGS } from '../core/settings';

function renderAbout(store: AppStoreHandle = createAppStore()) {
  const utils = render(
    <AppStoreProvider store={store}>
      <AboutDialog />
    </AppStoreProvider>,
  );
  return { ...utils, store };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('About dialog (AC-16)', () => {
  it('is hidden until help.about runs, then shows app name and version from app.getVersion', async () => {
    vi.spyOn(api.app, 'getVersion').mockResolvedValue({ name: 'Code Editor', version: '9.8.7' });
    renderAbout();
    expect(screen.queryByTestId('about-dialog')).toBeNull();

    act(() => {
      expect(runCommand('help.about')).toBe(true);
    });
    const dialog = await screen.findByRole('dialog', { name: 'Code Editor' });
    expect(dialog.textContent).toContain(ABOUT_DESCRIPTION);
    await waitFor(() => expect(screen.getByTestId('about-version').textContent).toBe('9.8.7'));
    expect(api.app.getVersion).toHaveBeenCalled();
  });

  it('closes with the Close button and with Escape', async () => {
    vi.spyOn(api.app, 'getVersion').mockResolvedValue({ name: 'Code Editor', version: '0.1.0' });
    const { store } = renderAbout(createAppStore(createInitialState({ overlay: 'about' })));
    await screen.findByText('0.1.0');
    expect(document.activeElement).toBe(screen.getByTestId('about-close'));
    fireEvent.click(screen.getByTestId('about-close'));
    expect(store.getState().overlay).toBeNull();
    expect(screen.queryByTestId('about-dialog')).toBeNull();

    act(() => store.dispatch({ type: 'overlay/set', overlay: 'about' }));
    await screen.findByText('0.1.0');
    fireEvent.keyDown(screen.getByTestId('about-dialog'), { key: 'Escape' });
    expect(store.getState().overlay).toBeNull();
  });

  it('shows a readable state when the version cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(api.app, 'getVersion').mockRejectedValue(new Error('internal-error'));
    renderAbout(createAppStore(createInitialState({ overlay: 'about' })));
    await waitFor(() => expect(screen.getByTestId('about-version').textContent).toBe('Unavailable'));
  });
});

describe('useMenuCommands', () => {
  it('forwards native menu command ids to runCommand', () => {
    let menuCb: ((id: string) => void) | null = null;
    vi.spyOn(api.app, 'onMenuCommand').mockImplementation((cb) => {
      menuCb = cb;
      return () => {
        menuCb = null;
      };
    });
    const ran = vi.fn();
    const off = registerHandler('test.menuForward', ran);
    const { unmount } = renderAbout();
    expect(menuCb).not.toBeNull();
    act(() => menuCb!('test.menuForward'));
    expect(ran).toHaveBeenCalledTimes(1);
    unmount();
    expect(menuCb).toBeNull();
    off();
  });

  it('a menu choice of Help > About opens the dialog', async () => {
    let menuCb: ((id: string) => void) | null = null;
    vi.spyOn(api.app, 'onMenuCommand').mockImplementation((cb) => {
      menuCb = cb;
      return () => undefined;
    });
    vi.spyOn(api.app, 'getVersion').mockResolvedValue({ name: 'Code Editor', version: '0.1.0' });
    const { store } = renderAbout();
    act(() => menuCb!('help.about'));
    expect(store.getState().overlay).toBe('about');
    expect(await screen.findByRole('dialog', { name: 'Code Editor' })).toBeTruthy();
  });

  it('zoom commands change the editor font size within bounds and reset it', () => {
    const { store } = renderAbout();
    act(() => {
      runCommand('view.zoomIn');
      runCommand('view.zoomIn');
    });
    expect(store.getState().settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize + 2);
    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe(`${DEFAULT_SETTINGS.fontSize + 2}px`);
    act(() => {
      runCommand('view.zoomOut');
    });
    expect(store.getState().settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize + 1);
    act(() => {
      runCommand('view.zoomReset');
    });
    expect(store.getState().settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
  });

  it('zoomFontSize clamps to the limits', () => {
    expect(zoomFontSize(ZOOM_MAX, 'in')).toBe(ZOOM_MAX);
    expect(zoomFontSize(ZOOM_MIN, 'out')).toBe(ZOOM_MIN);
    expect(zoomFontSize(20, 'reset')).toBe(DEFAULT_SETTINGS.fontSize);
    expect(zoomFontSize(Number.NaN, 'in')).toBe(DEFAULT_SETTINGS.fontSize + 1);
  });

  it('reports word wrap and the resolved theme to the native menu', async () => {
    const setMenuState = vi.spyOn(api.app, 'setMenuState').mockResolvedValue(undefined);
    const store = createAppStore(createInitialState({ settings: { ...DEFAULT_SETTINGS, theme: 'dark', wordWrap: false } }));
    renderAbout(store);
    expect(setMenuState).toHaveBeenLastCalledWith({ wordWrap: false, theme: 'dark' });
    act(() =>
      store.dispatch({ type: 'settings/set', settings: { ...store.getState().settings, wordWrap: true, theme: 'light' } }),
    );
    await waitFor(() => expect(setMenuState).toHaveBeenLastCalledWith({ wordWrap: true, theme: 'light' }));
  });
});
