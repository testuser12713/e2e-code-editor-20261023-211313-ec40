// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { getIndentUnit, indentUnit } from '@codemirror/language';
import { appStore } from '../state/AppStore';
import { DEFAULT_SETTINGS } from '../core/settings';
import { runCommand } from '../commands/registry';
import type { Settings } from '../types';
import {
  applySettingsToDocument,
  applySettingsToView,
  registerSettingsCommands,
  settingsExtensions,
  trackedViews,
} from './settingsExtensions';

const views: EditorView[] = [];

function makeView(s: Settings = appStore.getState().settings): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create({ doc: 'a\tb', extensions: [settingsExtensions(s)] }), parent });
  views.push(view);
  return view;
}

function setSettings(patch: Partial<Settings>) {
  appStore.dispatch({ type: 'settings/set', settings: { ...appStore.getState().settings, ...patch } });
}

afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
  appStore.dispatch({ type: 'settings/set', settings: { ...DEFAULT_SETTINGS } });
  document.body.innerHTML = '';
});

describe('settingsExtensions', () => {
  it('builds an editor from the settings', () => {
    const view = makeView({ ...DEFAULT_SETTINGS, fontSize: 17, tabSize: 4, insertSpaces: false, theme: 'dark', wordWrap: true, lineNumbers: false });
    expect(view.dom.style.getPropertyValue('--editor-font-size')).toBe('17px');
    expect(view.state.tabSize).toBe(4);
    expect(getIndentUnit(view.state)).toBe(4);
    expect(view.state.facet(indentUnit)).toBe('\t');
    expect(view.dom.classList.contains('theme-dark')).toBe(true);
    expect(view.dom.classList.contains('cm-lineWrapping') || view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
    expect(view.dom.classList.contains('no-line-numbers')).toBe(true);
  });

  it('reconfigures every open editor live when the store settings change', () => {
    const a = makeView();
    const b = makeView();
    expect(trackedViews()).toEqual(expect.arrayContaining([a, b]));

    setSettings({ fontSize: 20, theme: 'dark', tabSize: 8, insertSpaces: true, wordWrap: true, lineNumbers: false });
    for (const v of [a, b]) {
      expect(v.dom.style.getPropertyValue('--editor-font-size')).toBe('20px');
      expect(v.dom.classList.contains('theme-dark')).toBe(true);
      expect(v.state.tabSize).toBe(8);
      expect(v.state.facet(indentUnit)).toBe('        ');
      expect(v.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
      expect(v.dom.classList.contains('no-line-numbers')).toBe(true);
    }

    setSettings({ theme: 'light', fontFamily: 'Consolas', lineNumbers: true });
    for (const v of [a, b]) {
      expect(v.dom.classList.contains('theme-light')).toBe(true);
      expect(v.dom.classList.contains('theme-dark')).toBe(false);
      expect(v.dom.style.getPropertyValue('--editor-font')).toMatch(/^Consolas/);
      expect(v.dom.classList.contains('no-line-numbers')).toBe(false);
    }
  });

  it('stops tracking a destroyed editor', () => {
    const v = makeView();
    v.destroy();
    expect(trackedViews()).not.toContain(v);
    expect(() => setSettings({ fontSize: 15 })).not.toThrow();
  });

  it('applySettingsToView reconfigures a single editor', () => {
    const v = makeView();
    applySettingsToView(v, { ...DEFAULT_SETTINGS, fontSize: 9 });
    expect(v.dom.style.getPropertyValue('--editor-font-size')).toBe('9px');
  });
});

describe('applySettingsToDocument', () => {
  it('writes the editor CSS custom properties', () => {
    const root = document.createElement('div');
    applySettingsToDocument({ ...DEFAULT_SETTINGS, fontSize: 21, tabSize: 4 }, root);
    expect(root.style.getPropertyValue('--editor-font-size')).toBe('21px');
    expect(root.style.getPropertyValue('--tab-size')).toBe('4');
    expect(root.style.getPropertyValue('--editor-font')).toContain('JetBrains Mono');
  });
});

describe('settings commands', () => {
  it('toggle theme switches between dark and light and restyles open editors', () => {
    const off = registerSettingsCommands(appStore);
    const v = makeView();
    setSettings({ theme: 'light' });
    runCommand('view.toggleTheme');
    expect(appStore.getState().settings.theme).toBe('dark');
    expect(v.dom.classList.contains('theme-dark')).toBe(true);
    runCommand('view.toggleTheme');
    expect(appStore.getState().settings.theme).toBe('light');
    expect(v.dom.classList.contains('theme-light')).toBe(true);
    off();
  });

  it('toggle word wrap, zoom and open settings', () => {
    const off = registerSettingsCommands(appStore);
    runCommand('view.toggleWordWrap');
    expect(appStore.getState().settings.wordWrap).toBe(true);
    runCommand('view.zoomIn');
    runCommand('view.zoomIn');
    expect(appStore.getState().settings.fontSize).toBe(15);
    runCommand('view.zoomOut');
    expect(appStore.getState().settings.fontSize).toBe(14);
    runCommand('view.zoomReset');
    expect(appStore.getState().settings.fontSize).toBe(13);
    setSettings({ fontSize: 32 });
    runCommand('view.zoomIn');
    expect(appStore.getState().settings.fontSize).toBe(32);
    runCommand('view.settings');
    expect(appStore.getState().sidebarView).toBe('settings');
    off();
  });
});
