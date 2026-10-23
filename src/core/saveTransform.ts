import type { Settings } from '../types';

/**
 * Applies the on-save transformations that are enabled in the settings
 * (trim trailing whitespace, ensure a final newline) to LF text.
 */
export function transformForSave(
  text: string,
  s: Pick<Settings, 'trimOnSave' | 'finalNewlineOnSave'>,
): string {
  let out = text;
  if (s.trimOnSave) out = out.replace(/[ \t]+$/gm, '');
  if (s.finalNewlineOnSave && out.length > 0 && !out.endsWith('\n')) out += '\n';
  return out;
}
