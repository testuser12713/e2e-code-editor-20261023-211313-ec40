import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App, { MENUS, SIDEBAR_VIEWS } from './App';
import { AppStoreProvider, appReducer, createAppStore, createInitialState, type AppStoreHandle } from './state/AppStore';
import { COMMANDS, registerHandler } from './commands/registry';
import indexHtml from '../index.html?raw';
import stylesCss from './styles.css?raw';

function renderShell(store: AppStoreHandle = createAppStore()) {
  const utils = render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  return { ...utils, store };
}

afterEach(() => {
  cleanup();
});

describe('app shell', () => {
  it('renders the frame of the approved screens: title bar, activity bar, sidebar, tab bar, editor area, status bar', () => {
    renderShell();
    expect(screen.getByTestId('title-bar')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Application menu' })).toBeTruthy();
    expect(screen.getByTestId('window-title').textContent).toBe('Code Editor');
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeTruthy();
    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Open files' })).toBeTruthy();
    expect(screen.getByTestId('editor-area')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('has one activity bar button per registered sidebar view, in route-table order', () => {
    renderShell();
    const bar = screen.getByRole('navigation', { name: 'Views' });
    const names = within(bar)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(SIDEBAR_VIEWS.map((r) => r.buttonLabel));
  });

  it('renders every registered view when its activity bar button is pressed', () => {
    const { store } = renderShell();
    for (const route of SIDEBAR_VIEWS) {
      fireEvent.click(screen.getByRole('button', { name: route.buttonLabel }));
      const sidebar = screen.getByTestId('sidebar');
      expect(sidebar.getAttribute('data-view')).toBe(route.id);
      expect(screen.getByRole('complementary', { name: route.label })).toBe(sidebar);
      expect(store.getState().sidebarView).toBe(route.id);
    }
  });

  it('marks exactly the active view button as current and switches it on click', () => {
    renderShell();
    const current = () =>
      SIDEBAR_VIEWS.filter((r) => screen.getByRole('button', { name: r.buttonLabel }).getAttribute('aria-current') === 'page').map(
        (r) => r.id,
      );
    expect(current()).toEqual(['explorer']);
    fireEvent.click(screen.getByRole('button', { name: 'Search (Ctrl+Shift+F)' }));
    expect(current()).toEqual(['search']);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(current()).toEqual(['settings']);
    fireEvent.click(screen.getByRole('button', { name: 'Explorer' }));
    expect(current()).toEqual(['explorer']);
  });

  it('activity bar buttons are focusable real buttons', () => {
    renderShell();
    const button = screen.getByRole('button', { name: 'Settings' });
    expect(button.tagName).toBe('BUTTON');
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('on narrow screens a view button shows the sidebar, pressing the active one again returns to the editor', () => {
    renderShell();
    const app = screen.getByTestId('app');
    expect(app.getAttribute('data-narrow')).toBe('main');
    fireEvent.click(screen.getByRole('button', { name: 'Search (Ctrl+Shift+F)' }));
    expect(app.getAttribute('data-narrow')).toBe('sidebar');
    fireEvent.click(screen.getByRole('button', { name: 'Search (Ctrl+Shift+F)' }));
    expect(app.getAttribute('data-narrow')).toBe('main');
  });

  it('resizes the sidebar from the keyboard and stores the width in the session', () => {
    const { store } = renderShell();
    const resizer = screen.getByRole('separator', { name: 'Resize sidebar' });
    const before = store.getState().session.sidebarWidth;
    fireEvent.keyDown(resizer, { key: 'ArrowRight' });
    expect(store.getState().session.sidebarWidth).toBe(before + 16);
    fireEvent.keyDown(resizer, { key: 'Home' });
    expect(store.getState().session.sidebarWidth).toBe(180);
  });

  it('shows the active file in the window title', async () => {
    const store = createAppStore(
      createInitialState({
        workspace: 'C:\\Demo\\weather-cli',
        tabs: [{ path: 'C:\\Demo\\weather-cli\\README.md', preview: false }],
        activeTab: 'C:\\Demo\\weather-cli\\README.md',
      }),
    );
    renderShell(store);
    expect(screen.getByTestId('window-title').textContent).toBe('README.md — Code Editor');
    await waitFor(() => expect(document.title).toBe('README.md — Code Editor'));
  });

  it('applies the theme setting to the document', () => {
    const store = createAppStore(createInitialState());
    renderShell(store);
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => store.dispatch({ type: 'settings/set', settings: { ...store.getState().settings, theme: 'dark' } }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('installs the global keybindings: a shortcut runs its registered command', () => {
    renderShell();
    const handler = vi.fn();
    const off = registerHandler('view.palette', handler);
    fireEvent.keyDown(window, { key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true });
    off();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('in-page menu bar', () => {
  it('lists only registered commands and opens each menu', () => {
    renderShell();
    const ids = new Set(COMMANDS.map((c) => c.id));
    for (const menu of MENUS) {
      for (const item of menu.items) if (item !== 'separator') expect(ids.has(item.commandId)).toBe(true);
    }
    expect(MENUS.map((m) => m.label)).toEqual(['File', 'Edit', 'View', 'Help']);
  });

  it('disables entries without a handler and runs a registered one', () => {
    renderShell();
    const handler = vi.fn();
    const off = registerHandler('help.about', handler);
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    const fileMenu = screen.getByRole('menu', { name: 'File' });
    expect((within(fileMenu).getByRole('menuitem', { name: /Save All/ }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.queryByRole('menu', { name: 'File' })).toBeNull();
    const about = within(screen.getByRole('menu', { name: 'Help' })).getByRole('menuitem', { name: /About Code Editor/ });
    expect((about as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(about);
    off();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and returns focus to the menu button', () => {
    renderShell();
    const off = registerHandler('view.quickOpen', () => undefined);
    const viewButton = screen.getByRole('button', { name: 'View' });
    fireEvent.click(viewButton);
    const menu = screen.getByRole('menu', { name: 'View' });
    fireEvent.keyDown(menu, { key: 'Escape' });
    off();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(viewButton);
  });

  it('closes on Escape even when every entry is disabled', () => {
    renderShell();
    const editButton = screen.getByRole('button', { name: 'Edit' });
    fireEvent.click(editButton);
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeTruthy();
    editButton.focus();
    fireEvent.keyDown(editButton, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('app store reducer', () => {
  it('switches the sidebar view and bumps the explorer', () => {
    let s = createInitialState();
    s = appReducer(s, { type: 'sidebar/setView', view: 'settings' });
    s = appReducer(s, { type: 'explorer/bump' });
    expect(s.sidebarView).toBe('settings');
    expect(s.explorerVersion).toBe(1);
  });

  it('renames open docs and the active tab below a renamed folder', () => {
    const doc = {
      path: 'C:\\w\\src\\a.ts',
      text: 'x',
      savedText: 'x',
      eol: 'lf' as const,
      language: 'typescript' as const,
      indent: { useTabs: false, size: 2 },
      readOnly: false,
      tooLarge: false,
      conflict: false,
    };
    let s = createInitialState({ docs: { [doc.path]: doc }, activeTab: doc.path });
    s = appReducer(s, { type: 'path/rename', from: 'C:\\w\\src', to: 'C:\\w\\lib' });
    expect(Object.keys(s.docs)).toEqual(['C:\\w\\lib\\a.ts']);
    expect(s.docs['C:\\w\\lib\\a.ts'].path).toBe('C:\\w\\lib\\a.ts');
    expect(s.activeTab).toBe('C:\\w\\lib\\a.ts');
  });
});

describe('renderer security (AC-25, AC-26)', () => {
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(indexHtml)?.[1] ?? '';

  it('index.html sets a strict Content-Security-Policy', () => {
    expect(csp).not.toBe('');
    expect(csp).not.toContain('unsafe-eval');
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1].trim();
    expect(scriptSrc).toBe("'self'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).not.toMatch(/https?:|\*/);
  });

  it('loads no remote resources from the HTML or the stylesheet', () => {
    expect(indexHtml).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(stylesCss).not.toMatch(/url\(\s*["']?(https?:)?\/\//);
    expect(stylesCss).not.toMatch(/@import/);
  });

  const sources = Object.entries(
    import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }),
  );

  it('never inserts markup as HTML in the renderer', () => {
    expect(sources.length).toBeGreaterThan(10);
    for (const [file, code] of sources) {
      expect({ file, hit: /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/.test(code) }).toEqual({ file, hit: false });
    }
  });

  it('keeps the process boundary: no Electron or Node modules in the renderer (AC-18)', () => {
    for (const [file, code] of sources) {
      const hit = /from ['"](electron|node:[a-z_]+|fs|path|child_process|os)['"]|require\(/.test(code);
      expect({ file, hit }).toEqual({ file, hit: false });
    }
  });
});
