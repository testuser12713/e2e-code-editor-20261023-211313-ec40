import type { LanguageId } from '../types';

/**
 * Maps a file path to its language mode by extension.
 * Skeleton: final signature, inert body — filled by "Add language detection
 * and syntax highlighting" (tests in language.test.ts).
 */
export function detectLanguage(path: string): LanguageId {
  void path;
  return 'plaintext';
}
