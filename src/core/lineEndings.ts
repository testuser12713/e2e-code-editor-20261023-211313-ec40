import type { Eol } from '../types';

/**
 * Line-ending handling. The editor always works on LF text; the file's own
 * ending is restored on save.
 * Skeleton: final signatures, inert bodies — filled by "Implement saving with
 * line-ending preservation" (tests in lineendings.test.ts).
 */

/** Detects the dominant line ending of a file's text. */
export function detectEol(text: string): Eol {
  void text;
  return 'lf';
}

/** Converts every CRLF (and lone CR) to LF. */
export function normalizeToLf(text: string): string {
  return text;
}

/** Converts LF text to the given line ending. */
export function applyEol(text: string, eol: Eol): string {
  void eol;
  return text;
}
