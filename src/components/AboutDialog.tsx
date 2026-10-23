/**
 * Help > About dialog (app name and version), shown while
 * state.overlay === 'about' (design/mockups/about.html), and
 * useMenuCommands(): forwards the native menu's command ids
 * (app.onMenuCommand) to runCommand, registers the About and zoom handlers
 * and keeps the native menu's check marks (word wrap, theme) in sync.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp, useAppStore, type AppStoreHandle } from '../state/AppStore';
import { api, errorCode } from '../platform';
import { registerHandler, runCommand } from '../commands/registry';
import { DEFAULT_SETTINGS } from '../core/settings';
import type { AppInfo, ThemeSetting } from '../types';
import { Dialog, Scrim } from '../ui/Dialog';
import { Button } from '../ui/Button';

export const ABOUT_DESCRIPTION = 'A fast, keyboard-driven code editor for Windows.';

/** Editor font size limits of the zoom commands (px). */
export const ZOOM_MIN = 8;
export const ZOOM_MAX = 32;

/** The font size after a zoom step; reset returns the default size. */
export function zoomFontSize(current: number, step: 'in' | 'out' | 'reset'): number {
  if (step === 'reset') return DEFAULT_SETTINGS.fontSize;
  const base = Number.isFinite(current) ? Math.round(current) : DEFAULT_SETTINGS.fontSize;
  const next = base + (step === 'in' ? 1 : -1);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

function applyZoom(store: AppStoreHandle, step: 'in' | 'out' | 'reset'): void {
  const settings = store.getState().settings;
  const fontSize = zoomFontSize(settings.fontSize, step);
  if (fontSize !== settings.fontSize) store.dispatch({ type: 'settings/set', settings: { ...settings, fontSize } });
}

/** 'dark' | 'light' the theme setting resolves to now, following the OS for 'system'. */
function useResolvedTheme(theme: ThemeSetting): 'dark' | 'light' {
  const query = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const [system, setSystem] = useState<'dark' | 'light'>(query);
  useEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystem(mq.matches ? 'dark' : 'light');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [theme]);
  return theme === 'system' ? system : theme;
}

export function AboutDialog() {
  const { state, dispatch } = useApp();
  const open = state.overlay === 'about';
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let alive = true;
    api.app.getVersion().then(
      (result) => {
        if (!alive) return;
        setInfo(result);
        setFailed(false);
      },
      (err: unknown) => {
        console.error('[about] getVersion failed:', errorCode(err));
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const close = () => {
    dispatch({ type: 'overlay/set', overlay: null });
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target && target.isConnected) target.focus();
  };

  const version = info ? info.version : failed ? 'Unavailable' : '…';

  return (
    <>
      <Scrim onPress={close} />
      <Dialog
        title={info?.name ?? 'Code Editor'}
        icon="logo"
        onClose={close}
        testId="about-dialog"
        meta={[{ term: 'Version', value: version, testId: 'about-version' }]}
        actions={
          <Button variant="primary" onClick={close} data-testid="about-close">
            Close
          </Button>
        }
      >
        {ABOUT_DESCRIPTION}
      </Dialog>
    </>
  );
}

/** Called ONCE inside AppStore (so useApp() works). */
export function useMenuCommands(): void {
  const store = useAppStore();
  const { state } = useApp();
  const wordWrap = state.settings.wordWrap;
  const theme = useResolvedTheme(state.settings.theme);
  const fontSize = state.settings.fontSize;

  // Native menu items arrive as command ids and run exactly like their shortcuts.
  useEffect(
    () =>
      api.app.onMenuCommand((commandId) => {
        if (typeof commandId === 'string' && commandId !== '') runCommand(commandId);
      }),
    [],
  );

  useEffect(() => {
    const offs = [
      registerHandler('help.about', () => store.dispatch({ type: 'overlay/set', overlay: 'about' })),
      registerHandler('view.zoomIn', () => applyZoom(store, 'in')),
      registerHandler('view.zoomOut', () => applyZoom(store, 'out')),
      registerHandler('view.zoomReset', () => applyZoom(store, 'reset')),
    ];
    return () => offs.forEach((off) => off());
  }, [store]);

  // The editor font size follows the setting (styles.css: .cm-editor uses --editor-font-size).
  useEffect(() => {
    if (Number.isFinite(fontSize) && fontSize > 0) {
      document.documentElement.style.setProperty('--editor-font-size', `${fontSize}px`);
    }
  }, [fontSize]);

  useEffect(() => {
    api.app.setMenuState({ wordWrap, theme }).catch((err: unknown) => console.error('[menu] setMenuState failed:', errorCode(err)));
  }, [wordWrap, theme]);
}
