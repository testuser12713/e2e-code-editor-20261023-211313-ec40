/**
 * Fuzzy matching for Quick Open and the command palette.
 *
 * The query must appear in the text as a case-insensitive subsequence
 * (spaces in the query are ignored). Among all ways to place the query, the
 * best-scoring one is chosen; each matched character earns a base point plus
 * bonuses for:
 *  - contiguity: it directly follows the previous matched character;
 *  - word start: it is the first character or follows a separator (`/ \ . _ - :` or space);
 *  - camelCase: an upper-case letter that follows a lower-case letter or digit.
 * Gaps between matched characters and long texts cost a little, so tighter and
 * shorter matches win ties.
 */

export interface FuzzyMatch {
  score: number;
  /** Indices into `text` of the matched characters, ascending. */
  indices: number[];
}

const BASE = 1;
const CONTIGUOUS_BONUS = 5;
const WORD_START_BONUS = 4;
const CAMEL_BONUS = 3;
const GAP_PENALTY = 0.1;
const LENGTH_PENALTY = 0.02;
const SEPARATORS = '/\\._-: ';

function isUpper(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

function isLowerOrDigit(ch: string): boolean {
  return (ch !== ch.toUpperCase() && ch === ch.toLowerCase()) || (ch >= '0' && ch <= '9');
}

/** Bonus a match at position `j` of `text` earns on its own (word start / camelCase). */
function positionBonus(text: string, j: number): number {
  if (j === 0) return WORD_START_BONUS;
  const prev = text[j - 1];
  if (SEPARATORS.includes(prev)) return WORD_START_BONUS;
  if (isUpper(text[j]) && isLowerOrDigit(prev)) return CAMEL_BONUS;
  return 0;
}

/**
 * Best match of `query` in `text`, or null when `query` is not a subsequence.
 * An empty (or all-space) query matches everything with score 0.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.replace(/\s+/g, '').toLowerCase();
  if (q.length === 0) return { score: 0, indices: [] };
  const n = text.length;
  const m = q.length;
  if (m > n) return null;
  const lower = text.toLowerCase();

  // Quick reject: is q a subsequence at all?
  let probe = 0;
  for (let i = 0; i < m; i++) {
    probe = lower.indexOf(q[i], probe);
    if (probe < 0) return null;
    probe++;
  }

  // dp[i*n + j]: best score with q[i] matched at text[j] (-Infinity = impossible).
  const dp = new Float64Array(m * n).fill(-Infinity);
  const parent = new Int32Array(m * n).fill(-1);
  const bonus = new Float64Array(n);
  for (let j = 0; j < n; j++) bonus[j] = positionBonus(text, j);

  for (let j = 0; j < n; j++) {
    if (lower[j] === q[0]) dp[j] = BASE + bonus[j];
  }
  for (let i = 1; i < m; i++) {
    const prevRow = (i - 1) * n;
    const row = i * n;
    // Running best of dp[i-1][k] + k*GAP for k <= j-2 (a gap of >= 1 char).
    let bestGap = -Infinity;
    let bestGapK = -1;
    for (let j = i; j < n; j++) {
      const k = j - 2;
      if (k >= 0 && dp[prevRow + k] !== -Infinity) {
        const v = dp[prevRow + k] + k * GAP_PENALTY;
        if (v > bestGap) {
          bestGap = v;
          bestGapK = k;
        }
      }
      if (lower[j] !== q[i]) continue;
      const own = BASE + bonus[j];
      let best = -Infinity;
      let from = -1;
      const contiguous = dp[prevRow + j - 1];
      if (contiguous !== -Infinity) {
        best = contiguous + CONTIGUOUS_BONUS;
        from = j - 1;
      }
      if (bestGapK >= 0) {
        const viaGap = bestGap - (j - 1) * GAP_PENALTY;
        if (viaGap > best) {
          best = viaGap;
          from = bestGapK;
        }
      }
      if (from >= 0) {
        dp[row + j] = best + own;
        parent[row + j] = from;
      }
    }
  }

  const lastRow = (m - 1) * n;
  let end = -1;
  let endScore = -Infinity;
  for (let j = m - 1; j < n; j++) {
    if (dp[lastRow + j] > endScore) {
      endScore = dp[lastRow + j];
      end = j;
    }
  }
  if (end < 0) return null;

  const indices = new Array<number>(m);
  let j = end;
  for (let i = m - 1; i >= 0; i--) {
    indices[i] = j;
    j = parent[i * n + j];
  }
  return { score: endScore - n * LENGTH_PENALTY, indices };
}

/**
 * Scores how well `query` matches `text` as a subsequence.
 * Higher is better; null means "no match".
 */
export function fuzzyScore(query: string, text: string): number | null {
  const match = fuzzyMatch(query, text);
  return match ? match.score : null;
}

/** Bonus for a query that fits inside the file name alone. */
const NAME_MATCH_BONUS = 8;

/**
 * Matches a (relative) file path: the file name is tried first and wins a
 * bonus; otherwise the whole path is matched. Indices refer to `path`.
 */
export function fuzzyMatchPath(query: string, path: string): FuzzyMatch | null {
  const base = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1;
  if (base > 0) {
    const inName = fuzzyMatch(query, path.slice(base));
    if (inName) {
      return {
        score: inName.score + NAME_MATCH_BONUS - base * LENGTH_PENALTY,
        indices: inName.indices.map((i) => i + base),
      };
    }
  }
  return fuzzyMatch(query, path);
}

/** Returns the matching items, best match first (ties keep their input order). */
export function rankFuzzy<T>(query: string, items: T[], get: (t: T) => string): T[] {
  if (query.trim() === '') return items.slice();
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const score = fuzzyScore(query, get(item));
    if (score !== null) scored.push({ item, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.item);
}
