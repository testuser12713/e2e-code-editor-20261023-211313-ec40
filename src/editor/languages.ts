import type { Extension } from '@codemirror/state';
import type { LanguageId } from '../types';

/** Display names of the language modes (status bar, language picker). */
export const LANGUAGE_NAMES: Record<LanguageId, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  markdown: 'Markdown',
  python: 'Python',
  cpp: 'C/C++',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  plaintext: 'Plain Text',
};

/** Every language mode, in picker order. */
export const LANGUAGE_IDS = Object.keys(LANGUAGE_NAMES) as LanguageId[];

/**
 * The CodeMirror language support for a mode (empty for plain text).
 * Skeleton: final signature, inert body — filled by "Add language detection
 * and syntax highlighting".
 */
export function languageExtension(id: LanguageId): Extension {
  void id;
  return [];
}

/**
 * Syntax highlighting bound to the design's --syn-* colour tokens, so it
 * follows the light and dark theme.
 * Skeleton: final signature, inert body — filled by the same ticket.
 */
export function highlightExtension(): Extension {
  return [];
}
