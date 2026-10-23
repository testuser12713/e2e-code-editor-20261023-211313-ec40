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
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useApp, useAppStore } from './state/AppStore';
import { api, errorCode, isDesktop } from './platform';
import { installKeybindings } from './commands/keybindings';
import { getCommand, hasHandler, runCommand } from './commands/registry';
import type { SidebarView, ThemeSetting } from './types';
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

export const APP_NAME = 'Code Editor';

/* ---------- icons (paths of the design's symbol sheet) ---------- */

type IconName = 'files' | 'search' | 'settings' | 'logo';

const ICON_PATHS: Record<IconName, ReactNode> = {
  files: (
    <>
      <path d="M5 2.5h4.5l3 3V11H5z" />
      <path d="M9.5 2.5v3h3" />
      <path d="M3 5.5v8h7" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2L14 14" />
    </>
  ),
  settings: (
    <>
      <path d="M2 4.5h6M11.5 4.5H14M2 11.5h2.5M8 11.5h6" />
      <circle cx="9.8" cy="4.5" r="1.7" />
      <circle cx="6.2" cy="11.5" r="1.7" />
    </>
  ),
  logo: <path d="M6 3.5L2 8l4 4.5M10 3.5L14 8l-4 4.5" />,
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

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

function MenuBar() {
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
    if (!openId) return;
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
    <nav className="menubar" aria-label="Application menu" ref={barRef} onKeyDown={onMenuKeyDown}>
      {MENUS.map((menu) => {
        const expanded = openId === menu.id;
        return (
          <div className="menubar-entry" key={menu.id}>
            <button
              className="menubar-item"
              type="button"
              data-menu={menu.id}
              data-testid={`menu-${menu.id}`}
              aria-haspopup="menu"
              aria-expanded={expanded}
              onClick={() => setOpenId(expanded ? null : menu.id)}
              onPointerEnter={() => {
                if (openId && !expanded) setOpenId(menu.id);
              }}
            >
              {menu.label}
            </button>
            {expanded && (
              <div className="menu" role="menu" aria-label={menu.label}>
                {menu.items.map((item, i) => {
                  if (item === 'separator') return <div className="menu-sep" role="separator" key={`sep-${i}`} />;
                  const enabled = hasHandler(item.commandId);
                  const shortcut = getCommand(item.commandId)?.shortcut;
                  return (
                    <button
                      key={item.commandId}
                      className="menu-item"
                      type="button"
                      role="menuitem"
                      disabled={!enabled}
                      aria-disabled={!enabled}
                      title={enabled ? undefined : 'Not available yet'}
                      onClick={() => {
                        close(false);
                        runCommand(item.commandId);
                      }}
                    >
                      <span>{item.label}</span>
                      {shortcut && <span className="menu-shortcut">{shortcut}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function TitleBar({ title }: { title: string }) {
  return (
    <header className="titlebar" data-testid="title-bar">
      <span className="titlebar-brand">
        <Icon name="logo" />
      </span>
      <MenuBar />
      <div className="titlebar-title" data-testid="window-title">
        {title}
      </div>
      <div className="window-controls" aria-hidden="true">
        <span>
          <svg className="icon" viewBox="0 0 12 12" focusable="false">
            <path d="M2 6h8" fill="none" stroke="currentColor" />
          </svg>
        </span>
        <span>
          <svg className="icon" viewBox="0 0 12 12" focusable="false">
            <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" />
          </svg>
        </span>
        <span>
          <svg className="icon" viewBox="0 0 12 12" focusable="false">
            <path d="M2 2l8 8M10 2L2 10" fill="none" stroke="currentColor" />
          </svg>
        </span>
      </div>
    </header>
  );
}

/* ---------- activity bar ---------- */

function ActivityBar({ active, onSelect }: { active: SidebarView; onSelect: (id: SidebarView) => void }) {
  const button = (route: SidebarRoute) => (
    <button
      key={route.id}
      className="activity-btn"
      type="button"
      aria-label={route.buttonLabel}
      title={route.buttonLabel}
      aria-current={route.id === active ? 'page' : undefined}
      data-testid={`activity-${route.id}`}
      onClick={() => onSelect(route.id)}
    >
      <Icon name={route.icon} />
    </button>
  );
  return (
    <nav className="activitybar" aria-label="Views" data-testid="activity-bar">
      {SIDEBAR_VIEWS.filter((r) => r.placement === 'top').map(button)}
      <span className="activity-spacer" />
      {SIDEBAR_VIEWS.filter((r) => r.placement === 'bottom').map(button)}
    </nav>
  );
}

/* ---------- sidebar resizer ---------- */

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 600;
const SETTINGS_SIDEBAR_MIN = 340;

const clampWidth = (w: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));

function SidebarResizer({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { startX: e.clientX, startWidth: width };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(clampWidth(drag.current.startWidth + e.clientX - drag.current.startX));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') onResize(clampWidth(width - step));
    else if (e.key === 'ArrowRight') onResize(clampWidth(width + step));
    else if (e.key === 'Home') onResize(SIDEBAR_MIN);
    else if (e.key === 'End') onResize(SIDEBAR_MAX);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      data-dragging={dragging ? 'true' : undefined}
      data-testid="sidebar-resizer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}

/* ---------- shell hooks ---------- */

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i >= 0 ? path.slice(i + 1) : path;
}

/** Sets data-theme on <html> from the setting, following the OS scheme for "system". */
function useThemeAttribute(theme: ThemeSetting): void {
  useEffect(() => {
    const root = document.documentElement;
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const apply = () => {
      root.dataset.theme = theme === 'system' ? (mq?.matches ? 'dark' : 'light') : theme;
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
      {!isDesktop && <TitleBar title={title} />}
      <div className="workbench">
        <ActivityBar active={route.id} onSelect={selectView} />
        <aside
          className="sidebar"
          aria-label={route.label}
          data-testid="sidebar"
          data-view={route.id}
          style={{ '--sidebar-w': `${shownWidth}px` } as CSSProperties}
        >
          <SidebarContent />
        </aside>
        <SidebarResizer width={sidebarWidth} onResize={resizeSidebar} />
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
