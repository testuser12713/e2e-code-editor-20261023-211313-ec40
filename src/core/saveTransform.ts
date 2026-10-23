import type { Settings } from '../types';

/**
 * Applies the on-save transformations that are enabled in the settings
 * (trim trailing whitespace, ensure a final newline) to LF text.
 * Skeleton: final signature, inert body — filled by "Implement saving with
 * line-ending preservation" (tests in savetransform.test.ts).
 */
export function transformForSave(
  text: string,
  s: Pick<Settings, 'trimOnSave' | 'finalNewlineOnSave'>,
): string {
  void s;
  return text;
}
