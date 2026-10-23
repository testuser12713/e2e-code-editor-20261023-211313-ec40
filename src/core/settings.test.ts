import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  clampFontSize,
  fontStack,
  parseSettings,
  resolveTheme,
  serializeSettings,
} from './settings';

describe('parseSettings', () => {
  it('returns the defaults for missing input', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to the defaults for corrupt JSON and non-objects without throwing', () => {
    expect(parseSettings('{"fontSize": 14')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2,3]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('"text"')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps every valid field from a JSON string or an object', () => {
    const stored = {
      fontFamily: 'Consolas',
      fontSize: 16,
      tabSize: 4,
      insertSpaces: false,
      wordWrap: true,
      lineNumbers: false,
      trimOnSave: true,
      finalNewlineOnSave: true,
      theme: 'dark',
    };
    expect(parseSettings(stored)).toEqual(stored);
    expect(parseSettings(JSON.stringify(stored))).toEqual(stored);
  });

  it('replaces only the invalid fields with their defaults', () => {
    const parsed = parseSettings({
      fontFamily: 'Comic Something',
      fontSize: 'big',
      tabSize: 3,
      insertSpaces: 'yes',
      wordWrap: true,
      theme: 'purple',
    });
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, wordWrap: true });
  });

  it('clamps the font size to 8..32 whole pixels', () => {
    expect(parseSettings({ fontSize: 2 }).fontSize).toBe(8);
    expect(parseSettings({ fontSize: 99 }).fontSize).toBe(32);
    expect(parseSettings({ fontSize: 14.4 }).fontSize).toBe(14);
    expect(parseSettings({ fontSize: Number.NaN }).fontSize).toBe(DEFAULT_SETTINGS.fontSize);
  });

  it('drops unknown fields', () => {
    expect(parseSettings({ content: 'secret buffer', theme: 'light' })).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' });
  });

  it('does not share the defaults object', () => {
    const a = parseSettings(null);
    a.fontSize = 20;
    expect(DEFAULT_SETTINGS.fontSize).toBe(13);
  });
});

describe('serializeSettings', () => {
  it('round-trips through parseSettings', () => {
    const s = { ...DEFAULT_SETTINGS, theme: 'dark' as const, fontSize: 18, wordWrap: true };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('writes settings fields only', () => {
    const extra = { ...DEFAULT_SETTINGS, content: 'buffer' } as unknown as typeof DEFAULT_SETTINGS;
    expect(Object.keys(JSON.parse(serializeSettings(extra))).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });
});

describe('helpers', () => {
  it('clampFontSize keeps sizes in range', () => {
    expect(clampFontSize(7)).toBe(8);
    expect(clampFontSize(33)).toBe(32);
    expect(clampFontSize(20)).toBe(20);
  });

  it('fontStack falls back to the default family', () => {
    expect(fontStack('Consolas')).toMatch(/^Consolas/);
    expect(fontStack('unknown')).toBe(fontStack('JetBrains Mono'));
  });

  it('resolveTheme follows the system only for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});
