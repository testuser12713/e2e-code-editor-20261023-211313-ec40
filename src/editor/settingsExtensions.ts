import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS, clampFontSize, fontStack, resolveTheme } from '../core/settings';
import { registerHandler } from '../commands/registry';
import { appStore, type AppStoreHandle } from '../state/AppStore';

/**
 * Editor extensions that depend on the settings (font, tab size, indent
 * unit, word wrap, line numbers, dark/light editor theme), held in
 * compartments so a change applies live to every open editor: every editor
 * built with settingsExtensions() follows the app store's settings (and the
 * OS colour scheme while the theme is "system") until it is destroyed.
 */

export const fontCompartment = new Compartment();
export const tabSizeCompartment = new Compartment();
export const indentUnitCompartment = new Compartment();
export const wordWrapCompartment = new Compartment();
export const lineNumbersCompartment = new Compartment();
export const themeCompartment = new Compartment();

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(DARK_QUERY);
}

/** true when the OS asks for a dark colour scheme. */
export function systemPrefersDark(): boolean {
  return systemQuery()?.matches ?? false;
}

/** The theme an editor shows for these settings right now. */
export function editorTheme(s: Settings): 'dark' | 'light' {
  return resolveTheme(s.theme, systemPrefersDark());
}

/* ---------- compartment contents ---------- */

function fontExtension(s: Settings): Extension {
  return EditorView.editorAttributes.of({
    style: `--editor-font-size: ${clampFontSize(s.fontSize)}px; --editor-font: ${fontStack(s.fontFamily)}`,
  });
}

function tabSizeExtension(s: Settings): Extension {
  return [EditorState.tabSize.of(s.tabSize), EditorView.editorAttributes.of({ style: `--tab-size: ${s.tabSize}` })];
}

function indentUnitExtension(s: Settings): Extension {
  return indentUnit.of(s.insertSpaces ? ' '.repeat(s.tabSize) : '\t');
}

function wordWrapExtension(s: Settings): Extension {
  return s.wordWrap ? [EditorView.lineWrapping, EditorView.editorAttributes.of({ class: 'is-wrapped' })] : [];
}

/** The line-number gutter itself comes from basics; this hides it (styles.css `.no-line-numbers`). */
function lineNumbersExtension(s: Settings): Extension {
  return s.lineNumbers ? [] : EditorView.editorAttributes.of({ class: 'no-line-numbers' });
}

/** Scopes the design tokens of one theme to the editor (styles.css `.theme-dark` / `.theme-light`). */
function themeExtension(theme: 'dark' | 'light'): Extension {
  return [EditorView.darkTheme.of(theme === 'dark'), EditorView.editorAttributes.of({ class: `theme-${theme}` })];
}

/* ---------- live tracking ---------- */

interface Applied {
  settings: Settings;
  theme: 'dark' | 'light';
}

const applied = new WeakMap<EditorView, Applied>();
const liveViews = new Set<EditorView>();

/** Every live editor built with settingsExtensions(). */
export function trackedViews(): EditorView[] {
  return [...liveViews];
}

/** Reconfigures an existing editor for new settings. */
export function applySettingsToView(view: EditorView, s: Settings): void {
  const theme = editorTheme(s);
  const prev = applied.get(view);
  if (prev && prev.theme === theme && JSON.stringify(prev.settings) === JSON.stringify(s)) return;
  const effects = [];
  if (!prev || prev.settings.fontSize !== s.fontSize || prev.settings.fontFamily !== s.fontFamily) {
    effects.push(fontCompartment.reconfigure(fontExtension(s)));
  }
  if (!prev || prev.settings.tabSize !== s.tabSize) effects.push(tabSizeCompartment.reconfigure(tabSizeExtension(s)));
  if (!prev || prev.settings.tabSize !== s.tabSize || prev.settings.insertSpaces !== s.insertSpaces) {
    effects.push(indentUnitCompartment.reconfigure(indentUnitExtension(s)));
  }
  if (!prev || prev.settings.wordWrap !== s.wordWrap) effects.push(wordWrapCompartment.reconfigure(wordWrapExtension(s)));
  if (!prev || prev.settings.lineNumbers !== s.lineNumbers) {
    effects.push(lineNumbersCompartment.reconfigure(lineNumbersExtension(s)));
  }
  if (!prev || prev.theme !== theme) effects.push(themeCompartment.reconfigure(themeExtension(theme)));
  applied.set(view, { settings: { ...s }, theme });
  if (effects.length > 0) view.dispatch({ effects });
}

/** Reconfigures every live editor for new settings. */
export function applySettingsToAllViews(s: Settings): void {
  for (const view of liveViews) applySettingsToView(view, s);
}

/**
 * Follows the store's settings for one editor: reconfigures it whenever the
 * settings object changes or the OS colour scheme flips, until destroyed.
 */
function liveSettings(built: Settings): Extension {
  return ViewPlugin.define((view) => {
    liveViews.add(view);
    applied.set(view, { settings: { ...built }, theme: editorTheme(built) });
    const store: AppStoreHandle = appStore;
    let last = store.getState().settings;
    const sync = () => {
      const s = store.getState().settings;
      if (s === last) return;
      last = s;
      applySettingsToView(view, s);
    };
    const unsubscribe = store.subscribe(sync);
    const mq = systemQuery();
    const onScheme = () => applySettingsToView(view, store.getState().settings);
    mq?.addEventListener('change', onScheme);
    // Catch up with a change that happened between building the extensions and mounting.
    queueMicrotask(() => {
      if (liveViews.has(view)) applySettingsToView(view, store.getState().settings);
    });
    return {
      destroy() {
        liveViews.delete(view);
        unsubscribe();
        mq?.removeEventListener('change', onScheme);
      },
    };
  });
}

/**
 * The settings-dependent extensions of one editor, each in its compartment,
 * plus the live tracker that reconfigures them when the settings change.
 */
export function settingsExtensions(s: Settings): Extension {
  return [
    fontCompartment.of(fontExtension(s)),
    tabSizeCompartment.of(tabSizeExtension(s)),
    indentUnitCompartment.of(indentUnitExtension(s)),
    wordWrapCompartment.of(wordWrapExtension(s)),
    lineNumbersCompartment.of(lineNumbersExtension(s)),
    themeCompartment.of(themeExtension(editorTheme(s))),
    liveSettings(s),
  ];
}

/* ---------- commands ---------- */

function update(store: AppStoreHandle, patch: Partial<Settings>): void {
  const settings = { ...store.getState().settings, ...patch };
  store.dispatch({ type: 'settings/set', settings });
}

/**
 * view.toggleTheme (dark <-> light, starting from the theme shown now),
 * view.toggleWordWrap, view.settings and the zoom commands (editor font size).
 * Returns a disposer.
 */
export function registerSettingsCommands(store: AppStoreHandle = appStore): () => void {
  const offs = [
    registerHandler('view.toggleTheme', () => {
      update(store, { theme: editorTheme(store.getState().settings) === 'dark' ? 'light' : 'dark' });
    }),
    registerHandler('view.toggleWordWrap', () => update(store, { wordWrap: !store.getState().settings.wordWrap })),
    registerHandler('view.settings', () => store.dispatch({ type: 'sidebar/setView', view: 'settings' })),
    registerHandler('view.zoomIn', () => update(store, { fontSize: clampFontSize(store.getState().settings.fontSize + 1) })),
    registerHandler('view.zoomOut', () => update(store, { fontSize: clampFontSize(store.getState().settings.fontSize - 1) })),
    registerHandler('view.zoomReset', () => update(store, { fontSize: DEFAULT_SETTINGS.fontSize })),
  ];
  return () => offs.forEach((off) => off());
}

/* ---------- document ---------- */

/**
 * Mirrors the editor settings onto the document's CSS custom properties
 * (styles.css `--editor-font`, `--editor-font-size`, `--tab-size`) so every
 * editor surface — including one not built with settingsExtensions() — uses
 * them. The data-theme attribute itself is set by the app shell.
 */
export function applySettingsToDocument(s: Settings, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--editor-font-size', `${clampFontSize(s.fontSize)}px`);
  root.style.setProperty('--editor-font', fontStack(s.fontFamily));
  root.style.setProperty('--tab-size', String(s.tabSize));
}

let runtimeInstalled = false;

/**
 * Installs the settings runtime once: the settings commands and the document
 * mirror of the editor settings. Safe to call more than once.
 */
export function installSettingsRuntime(store: AppStoreHandle = appStore): void {
  if (runtimeInstalled) return;
  runtimeInstalled = true;
  registerSettingsCommands(store);
  if (typeof document === 'undefined') return;
  let last: Settings | null = null;
  const sync = () => {
    const s = store.getState().settings;
    if (s === last) return;
    last = s;
    applySettingsToDocument(s);
  };
  store.subscribe(sync);
  sync();
}
