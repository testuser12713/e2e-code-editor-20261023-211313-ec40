import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION,
  MAX_RECENT_WORKSPACES,
  addRecentWorkspace,
  clearRecentSession,
  parseSession,
  serializeSession,
} from './session';
import type { Session } from '../types';

const sample: Session = {
  recentWorkspaces: ['C:\\a', 'C:\\b'],
  lastWorkspace: 'C:\\a',
  openTabs: [
    { path: 'C:\\a\\x.ts', preview: false },
    { path: 'C:\\a\\y.md', preview: true },
  ],
  activeTab: 'C:\\a\\y.md',
  sidebarWidth: 300,
  windowBounds: { x: 10, y: 20, width: 1200, height: 800 },
};

describe('session', () => {
  it('round-trips', () => {
    expect(parseSession(serializeSession(sample))).toEqual(sample);
  });
  it('falls back to defaults on corrupt input', () => {
    expect(parseSession('{not json')).toEqual(DEFAULT_SESSION);
    expect(parseSession(null)).toEqual(DEFAULT_SESSION);
    expect(parseSession([1, 2])).toEqual(DEFAULT_SESSION);
    const p = parseSession({ recentWorkspaces: 'x', openTabs: [{ path: 5 }], sidebarWidth: 'wide', windowBounds: { x: 1 } });
    expect(p).toEqual(DEFAULT_SESSION);
  });
  it('drops unknown fields such as contents', () => {
    const json = serializeSession({ ...sample, text: 'secret', openTabs: [{ path: 'C:\\a\\x.ts', preview: false, text: 'b' }] } as unknown as Session);
    expect(json).not.toContain('secret');
    expect(json).not.toContain('"text"');
  });
  it('caps the recent list and clamps sidebar width', () => {
    const many = Array.from({ length: 30 }, (_, i) => `C:\\w${i}`);
    expect(parseSession({ recentWorkspaces: many }).recentWorkspaces).toHaveLength(MAX_RECENT_WORKSPACES);
    expect(parseSession({ sidebarWidth: 5 }).sidebarWidth).toBeGreaterThanOrEqual(160);
    let list: string[] = [];
    for (const p of many) list = addRecentWorkspace(list, p);
    expect(list).toHaveLength(MAX_RECENT_WORKSPACES);
    expect(addRecentWorkspace(['a', 'b'], 'b')).toEqual(['b', 'a']);
  });
  it('drops an active tab that is not open', () => {
    expect(parseSession({ ...sample, activeTab: 'C:\\other' }).activeTab).toBeNull();
  });
  it('clear removes every workspace path', () => {
    const json = serializeSession(clearRecentSession(sample));
    expect(json).not.toContain('C:');
    expect(parseSession(json).sidebarWidth).toBe(300);
  });
});
