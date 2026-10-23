import type { Settings, ThemeSetting } from '../types';

/** Defaults of every setting; a missing or corrupt settings file yields these. */
export const DEFAULT_SETTINGS: Settings = {
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: false,
  lineNumbers: true,
  trimOnSave: false,
  finalNewlineOnSave: false,
  theme: 'system',
};

/** Editor font families the Settings view offers (design/mockups/settings.html). */
export const FONT_FAMILIES = ['JetBrains Mono', 'Cascadia Mono', 'Consolas'] as const;

/** CSS font stacks per family (design/mockups/app.js FONT_STACKS). */
export const FONT_STACKS: Record<string, string> = {
  'JetBrains Mono': '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace',
  'Cascadia Mono': '"Cascadia Mono", Consolas, "Liberation Mono", monospace',
  Consolas: 'Consolas, "Liberation Mono", monospace',
};

/** Tab sizes the Settings view offers. */
export const TAB_SIZES = [2, 4, 8] as const;

export const THEMES: readonly ThemeSetting[] = ['system', 'dark', 'light'];

/** Editor font size limits in px ("In pixels, 8 to 32."). */
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;

/** The CSS font stack of a family (unknown families fall back to the default stack). */
export function fontStack(family: string): string {
  return FONT_STACKS[family] ?? FONT_STACKS[DEFAULT_SETTINGS.fontFamily];
}

/** Clamps a font size to 8..32 whole pixels; a non-number yields the default. */
export function clampFontSize(size: number): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return DEFAULT_SETTINGS.fontSize;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

/**
 * Parses stored settings (a JSON string or an already parsed object) and
 * falls back to the defaults for anything missing, invalid or corrupt —
 * never throws. Unknown fields are dropped.
 */
export function parseSettings(raw: unknown): Settings {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  const d = data as Record<string, unknown>;

  if (typeof d.fontFamily === 'string' && (FONT_FAMILIES as readonly string[]).includes(d.fontFamily)) {
    out.fontFamily = d.fontFamily;
  }
  if (typeof d.fontSize === 'number' && Number.isFinite(d.fontSize)) out.fontSize = clampFontSize(d.fontSize);
  if (typeof d.tabSize === 'number' && (TAB_SIZES as readonly number[]).includes(d.tabSize)) out.tabSize = d.tabSize;
  if (typeof d.theme === 'string' && (THEMES as readonly string[]).includes(d.theme)) out.theme = d.theme as ThemeSetting;
  const flags = ['insertSpaces', 'wordWrap', 'lineNumbers', 'trimOnSave', 'finalNewlineOnSave'] as const;
  for (const key of flags) {
    if (typeof d[key] === 'boolean') out[key] = d[key];
  }
  return out;
}

/** Serializes settings as JSON (settings only — never file contents; unknown fields are dropped). */
export function serializeSettings(s: Settings): string {
  return JSON.stringify(parseSettings(s), null, 2);
}

/**
 * Settings with one field set from a form control's raw value (a select's
 * string or a switch's checked flag), validated like stored settings. Returns
 * the SAME object when the key is unknown, the value is invalid or nothing
 * changes, so callers can skip a no-op dispatch by identity.
 */
export function withSetting(s: Settings, key: string, raw: string | boolean): Settings {
  if (!(key in DEFAULT_SETTINGS)) return s;
  const k = key as keyof Settings;
  let value: unknown = raw;
  if (typeof DEFAULT_SETTINGS[k] === 'number') {
    if (typeof raw !== 'string' || raw.trim() === '') return s;
    value = Number(raw);
  } else if (typeof DEFAULT_SETTINGS[k] === 'boolean') {
    if (typeof raw !== 'boolean') return s;
  } else if (typeof raw !== 'string') {
    return s;
  }
  const next = parseSettings({ ...s, [k]: value });
  // parseSettings falls back to the default for an invalid value; that is a rejection here.
  if (next[k] !== value) return s;
  return JSON.stringify(next) === JSON.stringify(parseSettings(s)) ? s : next;
}

/** The theme actually shown: 'system' follows prefers-color-scheme. */
export function resolveTheme(theme: ThemeSetting, systemDark: boolean): 'dark' | 'light' {
  if (theme === 'dark' || theme === 'light') return theme;
  return systemDark ? 'dark' : 'light';
}
