/**
 * Fuzzy matching for Quick Open and the command palette.
 * Skeleton: final signatures, inert bodies — filled by "Implement Quick Open
 * with fuzzy file search" (tests in fuzzy.test.ts).
 */

/**
 * Scores how well `query` matches `text` as a subsequence.
 * Higher is better; null means "no match".
 */
export function fuzzyScore(query: string, text: string): number | null {
  void query;
  void text;
  return null;
}

/** Returns the matching items, best match first. */
export function rankFuzzy<T>(query: string, items: T[], get: (t: T) => string): T[] {
  void query;
  void get;
  return items.slice();
}
