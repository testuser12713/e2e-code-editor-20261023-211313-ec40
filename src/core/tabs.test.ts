import { describe, expect, it } from 'vitest';
import { cycleTab, tabsReducer } from './tabs';
import type { Tab } from '../types';

const t = (path: string, preview = false): Tab => ({ path, preview });

describe('tabsReducer', () => {
  it('opens a preview tab and replaces the existing preview tab in place', () => {
    let s = tabsReducer([], { type: 'open', path: 'a', preview: false });
    s = tabsReducer(s, { type: 'open', path: 'b', preview: true });
    s = tabsReducer(s, { type: 'open', path: 'c', preview: false });
    expect(s).toEqual([t('a'), t('b', true), t('c')]);
    s = tabsReducer(s, { type: 'open', path: 'd', preview: true });
    expect(s).toEqual([t('a'), t('d', true), t('c')]);
  });

  it('opens a permanent tab at the end and pins an open preview tab of the same path', () => {
    let s = tabsReducer([t('a', true)], { type: 'open', path: 'b', preview: false });
    expect(s).toEqual([t('a', true), t('b')]);
    s = tabsReducer(s, { type: 'open', path: 'a', preview: false });
    expect(s).toEqual([t('a'), t('b')]);
  });

  it('keeps an already open tab when it is opened as preview again', () => {
    const s = [t('a'), t('b')];
    expect(tabsReducer(s, { type: 'open', path: 'a', preview: true })).toBe(s);
  });

  it('promotes a preview tab with pin and ignores unknown or permanent tabs', () => {
    const s = [t('a', true), t('b')];
    expect(tabsReducer(s, { type: 'pin', path: 'a' })).toEqual([t('a'), t('b')]);
    expect(tabsReducer(s, { type: 'pin', path: 'b' })).toBe(s);
    expect(tabsReducer(s, { type: 'pin', path: 'x' })).toBe(s);
  });

  it('closes one tab or all tabs', () => {
    const s = [t('a'), t('b', true), t('c')];
    expect(tabsReducer(s, { type: 'close', path: 'b' })).toEqual([t('a'), t('c')]);
    expect(tabsReducer(s, { type: 'close', path: 'x' })).toBe(s);
    expect(tabsReducer(s, { type: 'closeAll' })).toEqual([]);
  });

  it('reorders tabs and clamps the target index', () => {
    const s = [t('a'), t('b'), t('c')];
    expect(tabsReducer(s, { type: 'reorder', from: 0, to: 2 }).map((x) => x.path)).toEqual(['b', 'c', 'a']);
    expect(tabsReducer(s, { type: 'reorder', from: 2, to: 0 }).map((x) => x.path)).toEqual(['c', 'a', 'b']);
    expect(tabsReducer(s, { type: 'reorder', from: 1, to: 99 }).map((x) => x.path)).toEqual(['a', 'c', 'b']);
    expect(tabsReducer(s, { type: 'reorder', from: 5, to: 0 })).toBe(s);
    expect(tabsReducer(s, { type: 'reorder', from: 1, to: 1 })).toBe(s);
  });

  it('follows a renamed file or folder', () => {
    const s = [t('C:\\w\\src\\a.ts'), t('C:\\w\\src\\b.ts', true), t('C:\\w\\srcx\\c.ts')];
    const r = tabsReducer(s, { type: 'rename', from: 'C:\\w\\src', to: 'C:\\w\\lib' });
    expect(r).toEqual([t('C:\\w\\lib\\a.ts'), t('C:\\w\\lib\\b.ts', true), t('C:\\w\\srcx\\c.ts')]);
  });

  it('restores a list without duplicates and with at most one preview tab', () => {
    const r = tabsReducer([t('x')], { type: 'restore', tabs: [t('a', true), t('b', true), t('a'), t('c')] });
    expect(r).toEqual([t('a'), t('b', true), t('c')]);
  });
});

describe('cycleTab', () => {
  const tabs = [t('a'), t('b'), t('c')];
  it('moves to the next and previous tab, wrapping around', () => {
    expect(cycleTab(tabs, 'a', 1)).toBe('b');
    expect(cycleTab(tabs, 'c', 1)).toBe('a');
    expect(cycleTab(tabs, 'a', -1)).toBe('c');
  });
  it('handles no tabs and an unknown active tab', () => {
    expect(cycleTab([], null, 1)).toBeNull();
    expect(cycleTab(tabs, null, 1)).toBe('a');
    expect(cycleTab(tabs, null, -1)).toBe('c');
  });
});
