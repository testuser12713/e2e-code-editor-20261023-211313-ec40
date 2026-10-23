/**
 * The app shell — the shared frame of the approved screens
 * (design/mockups/editor.html, settings.html, welcome.html):
 * title bar (brand, menu bar, active-file title, window controls), activity
 * bar, sidebar with resizer, main column (tab bar + editor area) and the
 * status bar, plus the overlays. Every view and component of the contract is
 * rendered from here; feature tickets fill their own files.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useApp, useAppStore } from './state/AppStore';
import { api, errorCode, isDesktop } from './platform';
import { installKeybindings } from './commands/keybindings';
import { getCommand, hasHandler, runCommand } from './commands/registry';
import type { SidebarView, ThemeSetting } from './types';
import { resolveTheme } from './core/settings';
import { Explorer } from './views/Explorer';
import { SearchView } from './views/SearchView';
import { SettingsView } from './views/SettingsView';
import { Welcome } from './views/Welcome';
import { TabBar } from './components/TabBar';
import { EditorPane } from './components/EditorPane';
import { StatusBar } from './components/StatusBar';
import { QuickOpen } from './components/QuickOpen';
import { CommandPalette } from './components/CommandPalette';
import { GoToLine } from './components/GoToLine';
import { FindBar } from './components/FindBar';
import { SavePrompt } from './components/SavePrompt';
import { ConflictBanner } from './components/ConflictBanner';
import { AboutDialog } from './components/AboutDialog';
import { ExplorerContextMenu } from './components/ExplorerContextMenu';
import type { IconName } from './ui/Icon';
import { Menu, MenuItem, MenuSeparator } from './ui/Menu';
import { ActivityBar, ActivitySpacer, MenuBar, MenuBarEntry, MenuBarItem, TitleBar } from './ui/Chrome';
import { ActivityButton } from './ui/Button';
import { Resizer, clampSize } from './ui/Resizer';

export const APP_NAME = 'Code Editor';

/* ---------- route table of the sidebar ---------- */

export interface SidebarRoute {
  id: SidebarView;
  /** Accessible name of the sidebar region and its header. */
  label: string;
  /** Accessible name and tooltip of the activity bar button. */
  buttonLabel: string;
  icon: IconName;
  /** Top group, or bottom group after the activity bar spacer. */
  placement: 'top' | 'bottom';
  component: ComponentType;
}

export const SIDEBAR_VIEWS: SidebarRoute[] = [
  { id: 'explorer', label: 'Explorer', buttonLabel: 'Explorer', icon: 'files', placement: 'top', component: Explorer },
  { id: 'search', label: 'Search', buttonLabel: 'Search (Ctrl+Shift+F)', icon: 'search', placement: 'top', component: SearchView },
  { id: 'settings', label: 'Settings', buttonLabel: 'Settings', icon: 'settings', placement: 'bottom', component: SettingsView },
];

/* ---------- in-page menu bar (browser build; Electron shows the native one) ---------- */

interface MenuEntry {
  commandId: string;
  label: string;
}

export interface MenuDef {
  id: string;
  label: string;
  items: (MenuEntry | 'separator')[];
}

export const MENUS: MenuDef[] = [
  {
    id: 'file',
    label: 'File',
    items: [
      { commandId: 'file.openFolder', label: 'Open Folder…' },
      { commandId: 'file.openFile', label: 'Open File…' },
      'separator',
      { commandId: 'file.save', label: 'Save' },
      { commandId: 'file.saveAs', label: 'Save As…' },
      { commandId: 'file.saveAll', label: 'Save All' },
      'separator',
      { commandId: 'tab.close', label: 'Close Tab' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { commandId: 'editor.toggleComment', label: 'Toggle Line Comment' },
      { commandId: 'editor.moveLineUp', label: 'Move Line Up' },
      { commandId: 'editor.moveLineDown', label: 'Move Line Down' },
      { commandId: 'editor.duplicateLine', label: 'Duplicate Line' },
      { commandId: 'editor.selectNext', label: 'Select Next Occurrence' },
      'separator',
      { commandId: 'view.find', label: 'Find' },
      { commandId: 'view.replace', label: 'Replace' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { commandId: 'view.quickOpen', label: 'Quick Open…' },
      { commandId: 'view.palette', label: 'Command Palette…' },
      { commandId: 'view.goToLine', label: 'Go to Line…' },
      { commandId: 'view.workspaceSearch', label: 'Search in Workspace' },
      'separator',
      { commandId: 'view.toggleTheme', label: 'Toggle Dark/Light Theme' },
      { commandId: 'view.toggleWordWrap', label: 'Toggle Word Wrap' },
      'separator',
      { commandId: 'view.zoomIn', label: 'Zoom In' },
      { commandId: 'view.zoomOut', label: 'Zoom Out' },
      { commandId: 'view.zoomReset', label: 'Reset Zoom' },
      'separator',
      { commandId: 'view.settings', label: 'Settings' },
    ],
  },
  { id: 'help', label: 'Help', items: [{ commandId: 'help.about', label: 'About Code Editor' }] },
];

function AppMenuBar() {
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLElement>(null);

  const close = (refocus: boolean) => {
    if (refocus && openId) barRef.current?.querySelector<HTMLButtonElement>(`[data-menu="${openId}"]`)?.focus();
    setOpenId(null);
  };

  useEffect(() => {
    if (!openId) return;
    const onPointerDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    // Focus the first enabled entry of the menu that just opened.
    barRef.current?.querySelector<HTMLButtonElement>('.menu .menu-item:not([disabled])')?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openId]);

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    // Arrow keys inside an open menu are handled by the kit's Menu itself.
    if (!openId || e.defaultPrevented) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.menu .menu-item:not([disabled])'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <MenuBar ref={barRef} onKeyDown={onMenuKeyDown}>
      {MENUS.map((menu) => {
        const expanded = openId === menu.id;
        return (
          <MenuBarEntry key={menu.id}>
            <MenuBarItem
              expanded={expanded}
              data-menu={menu.id}
              data-testid={`menu-${menu.id}`}
              onClick={() => setOpenId(expanded ? null : menu.id)}
              onPointerEnter={() => {
                if (openId && !expanded) setOpenId(menu.id);
              }}
            >
              {menu.label}
            </MenuBarItem>
            {expanded && (
              <Menu label={menu.label}>
                {menu.items.map((item, i) => {
                  if (item === 'separator') return <MenuSeparator key={`sep-${i}`} />;
                  return (
                    <MenuItem
                      key={item.commandId}
                      label={item.label}
                      shortcut={getCommand(item.commandId)?.shortcut}
                      disabled={!hasHandler(item.commandId)}
                      onSelect={() => {
                        close(false);
                        runCommand(item.commandId);
                      }}
                    />
                  );
                })}
              </Menu>
            )}
          </MenuBarEntry>
        );
      })}
    </MenuBar>
  );
}

function AppTitleBar({ title }: { title: string }) {
  return <TitleBar menu={<AppMenuBar />} title={title} />;
}

/* ---------- activity bar ---------- */

function AppActivityBar({ active, onSelect }: { active: SidebarView; onSelect: (id: SidebarView) => void }) {
  const button = (route: SidebarRoute) => (
    <ActivityButton
      key={route.id}
      icon={route.icon}
      label={route.buttonLabel}
      current={route.id === active}
      data-testid={`activity-${route.id}`}
      onClick={() => onSelect(route.id)}
    />
  );
  return (
    <ActivityBar>
      {SIDEBAR_VIEWS.filter((r) => r.placement === 'top').map(button)}
      <ActivitySpacer />
      {SIDEBAR_VIEWS.filter((r) => r.placement === 'bottom').map(button)}
    </ActivityBar>
  );
}

/* ---------- sidebar resizer ---------- */

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 600;
const SETTINGS_SIDEBAR_MIN = 340;

const clampWidth = (w: number) => clampSize(w, SIDEBAR_MIN, SIDEBAR_MAX);

/* ---------- shell hooks ---------- */

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i >= 0 ? path.slice(i + 1) : path;
}

/**
 * Sets data-theme on <html> from the setting, following the OS scheme for
 * "system". A layout effect, so the window background changes in the same
 * commit as the setting (no frame in the old theme).
 */
function useThemeAttribute(theme: ThemeSetting): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const apply = () => {
      // The same resolution the editors use (src/editor/settingsExtensions.ts), so
      // the shell and every open editor always show one theme.
      root.dataset.theme = resolveTheme(theme, mq?.matches ?? false);
    };
    apply();
    if (theme !== 'system' || !mq) return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

const GALLERY_ROUTE = '#/gallery';
/** Dev-only: the UI kit gallery (src/ui/gallery.tsx) at #/gallery; never part of the production build. */
const GALLERY_LOADERS: Record<string, () => Promise<unknown>> = import.meta.env.DEV
  ? import.meta.glob('./ui/gallery.tsx')
  : {};

/** Returns the gallery component while the dev-only gallery route is open, else null. */
export function useDevGallery(): ComponentType | null {
  const [onRoute, setOnRoute] = useState(() => import.meta.env.DEV && window.location.hash === GALLERY_ROUTE);
  const [gallery, setGallery] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onHash = () => setOnRoute(window.location.hash === GALLERY_ROUTE);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const load = GALLERY_LOADERS['./ui/gallery.tsx'];
    if (!onRoute || !load || gallery) return;
    let alive = true;
    load().then(
      (mod) => {
        const m = mod as { default?: ComponentType; Gallery?: ComponentType };
        const component = m.default ?? m.Gallery;
        if (alive && component) setGallery(() => component);
      },
      (err: unknown) => console.error('[gallery] failed to load:', err instanceof Error ? err.name : 'unknown-error'),
    );
    return () => {
      alive = false;
    };
  }, [onRoute, gallery]);

  return onRoute ? gallery : null;
}

/* ---------- the shell ---------- */

export default function App() {
  const { state, dispatch } = useApp();
  const store = useAppStore();
  const Gallery = useDevGallery();
  /** At 720 px and below only one of sidebar and main column is shown. */
  const [narrowPane, setNarrowPane] = useState<'main' | 'sidebar'>('main');

  useThemeAttribute(state.settings.theme);
  useEffect(() => installKeybindings(window), []);

  const activeDoc = state.activeTab ? state.docs[state.activeTab] : undefined;
  const dirty = activeDoc ? activeDoc.text !== activeDoc.savedText : false;
  const title = state.activeTab ? `${dirty ? '● ' : ''}${baseName(state.activeTab)} — ${APP_NAME}` : APP_NAME;

  useEffect(() => {
    api.app.setTitle(title).catch((err: unknown) => console.error('[app] setTitle failed:', errorCode(err)));
  }, [title]);

  const selectView = (id: SidebarView) => {
    if (id === state.sidebarView) {
      setNarrowPane((p) => (p === 'sidebar' ? 'main' : 'sidebar'));
    } else {
      dispatch({ type: 'sidebar/setView', view: id });
      setNarrowPane('sidebar');
    }
  };

  const resizeSidebar = (width: number) => {
    const session = store.getState().session;
    if (session.sidebarWidth !== width) dispatch({ type: 'session/set', session: { ...session, sidebarWidth: width } });
  };

  if (Gallery) return <Gallery />;

  const route = SIDEBAR_VIEWS.find((r) => r.id === state.sidebarView) ?? SIDEBAR_VIEWS[0];
  const SidebarContent = route.component;
  const sidebarWidth = clampWidth(state.session.sidebarWidth);
  const shownWidth = route.id === 'settings' ? Math.max(SETTINGS_SIDEBAR_MIN, sidebarWidth) : sidebarWidth;
  const showWelcome = state.workspace === null && state.tabs.length === 0;
  const heading = route.id === 'settings' ? 'Settings' : showWelcome ? 'Welcome' : 'Editor';

  return (
    <div className="app" data-narrow={narrowPane} data-testid="app">
      {!isDesktop && <AppTitleBar title={title} />}
      <div className="workbench">
        <AppActivityBar active={route.id} onSelect={selectView} />
        <aside
          className="sidebar"
          aria-label={route.label}
          data-testid="sidebar"
          data-view={route.id}
          style={{ '--sidebar-w': `${shownWidth}px` } as CSSProperties}
        >
          <SidebarContent />
        </aside>
        <Resizer
          value={sidebarWidth}
          min={SIDEBAR_MIN}
          max={SIDEBAR_MAX}
          onResize={resizeSidebar}
          label="Resize sidebar"
          testId="sidebar-resizer"
        />
        <main className="main" data-testid="main-column">
          <h1 className="sr-only">{heading}</h1>
          <TabBar />
          <div className="editor-area" data-testid="editor-area">
            <ConflictBanner />
            {showWelcome ? <Welcome /> : <EditorPane />}
            <FindBar />
          </div>
        </main>
      </div>
      <StatusBar />
      <ExplorerContextMenu />
      <QuickOpen />
      <CommandPalette />
      <GoToLine />
      <AboutDialog />
      <SavePrompt />
    </div>
  );
}
