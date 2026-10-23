import type { SearchMatch } from '../types';

export interface SearchTextOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  /** Stop after this many matches (defaults to LIMITS.maxSearchMatches). */
  maxMatches?: number;
}

/**
 * Finds every match of the query in one file's content. Used by the browser
 * fallback (src/platform/demoFs.ts); the main process has its own worker.
 * An invalid regular expression throws an Error with message "invalid-regex".
 * Skeleton: final signature, inert body — filled by "Implement workspace
 * search" (tests in workspacesearch.test.ts).
 */
export function searchText(content: string, opts: SearchTextOptions): SearchMatch[] {
  void content;
  void opts;
  return [];
}
