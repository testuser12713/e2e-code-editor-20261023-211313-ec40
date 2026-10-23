import type { Eol } from '../types';

/**
 * Line-ending handling. The editor always works on LF text; the file's own
 * ending is restored on save.
 */

/** Detects the dominant line ending of a file's text (ties and no newline => 'lf'). */
export function detectEol(text: string): Eol {
  let crlf = 0;
  let lf = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++;
      else lf++;
    }
  }
  return crlf > lf ? 'crlf' : 'lf';
}

/** Converts every CRLF (and lone CR) to LF. */
export function normalizeToLf(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Converts LF text to the given line ending. */
export function applyEol(text: string, eol: Eol): string {
  const lf = normalizeToLf(text);
  return eol === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf;
}
