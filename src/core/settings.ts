import type { Settings } from '../types';

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

/**
 * Parses stored settings (a JSON string or an already parsed object) and
 * falls back to the defaults for anything missing, invalid or corrupt —
 * never throws.
 * Skeleton: final signature, inert body — filled by "Implement settings view
 * and themes" (tests in settings.test.ts).
 */
export function parseSettings(raw: unknown): Settings {
  void raw;
  return { ...DEFAULT_SETTINGS };
}

/** Serializes settings as JSON (settings only — never file contents). */
export function serializeSettings(s: Settings): string {
  return JSON.stringify(s, null, 2);
}
