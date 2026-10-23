import { describe, expect, it } from 'vitest';
import { fuzzyMatch, fuzzyMatchPath, fuzzyScore, rankFuzzy } from './fuzzy';

describe('fuzzyScore', () => {
  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'forecast.ts')).toBeNull();
    expect(fuzzyScore('tsf', 'forecast.ts')).toBeNull();
    expect(fuzzyScore('toolongquery', 'a.ts')).toBeNull();
  });

  it('matches case-insensitively and ignores spaces in the query', () => {
    expect(fuzzyScore('FORE', 'forecast.ts')).not.toBeNull();
    expect(fuzzyScore('fore ts', 'forecast.ts')).not.toBeNull();
  });

  it('gives an empty query score 0', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('prefers contiguous matches', () => {
    const contiguous = fuzzyScore('cast', 'forecast.ts')!;
    const scattered = fuzzyScore('cast', 'c-a-s-t.ts')!;
    // c-a-s-t has word starts for every char, so compare against a plain scatter
    const plain = fuzzyScore('cast', 'xcxaxsxt')!;
    expect(contiguous).toBeGreaterThan(plain);
    expect(scattered).toBeGreaterThan(plain);
  });

  it('rewards word starts and camelCase humps', () => {
    expect(fuzzyScore('gc', 'getConfig')!).toBeGreaterThan(fuzzyScore('gc', 'logic')!);
    expect(fuzzyScore('ft', 'format_table')!).toBeGreaterThan(fuzzyScore('ft', 'leftover')!);
  });

  it('finds the best placement, not the first one', () => {
    const m = fuzzyMatch('ab', 'axxab');
    expect(m?.indices).toEqual([3, 4]);
  });
});

describe('fuzzyMatchPath', () => {
  it('matches inside the file name first and offsets the indices', () => {
    const m = fuzzyMatchPath('ca', 'src\\api\\cache.ts');
    expect(m?.indices).toEqual([8, 9]);
  });

  it('falls back to the whole path', () => {
    const m = fuzzyMatchPath('apica', 'src/api/cache.ts');
    expect(m).not.toBeNull();
    expect(m!.indices[0]).toBe(4);
  });

  it('ranks a file-name hit above a folder-only hit', () => {
    const name = fuzzyMatchPath('args', 'src\\cli\\args.ts')!.score;
    const folder = fuzzyMatchPath('args', 'args\\other\\index.ts')!.score;
    expect(name).toBeGreaterThan(folder);
  });
});

describe('rankFuzzy', () => {
  const files = ['src/api/forecast.ts', 'src/api/cache.ts', 'README.md', 'src/cli/args.ts', 'src/format/table.ts'];

  it('orders the best match first and drops non-matches', () => {
    expect(rankFuzzy('ca', files, (f) => f.slice(f.lastIndexOf('/') + 1))).toEqual([
      'src/api/cache.ts',
      'src/api/forecast.ts',
    ]);
  });

  it('ranks camelCase and word-start hits above inner hits', () => {
    const items = ['logic.ts', 'getConfig.ts', 'gc.ts'];
    expect(rankFuzzy('gc', items, (s) => s)).toEqual(['gc.ts', 'getConfig.ts', 'logic.ts']);
  });

  it('keeps the input order for an empty query and for ties', () => {
    expect(rankFuzzy('', files, (f) => f)).toEqual(files);
    expect(rankFuzzy('x', ['ax', 'bx'], (s) => s)).toEqual(['ax', 'bx']);
  });

  it('ranks 10,000 paths quickly', () => {
    const many = Array.from({ length: 10000 }, (_, i) => `src/module${i % 97}/component${i}/fileName${i}.tsx`);
    const t0 = Date.now();
    const ranked = rankFuzzy('fn42', many, (s) => s);
    expect(ranked.length).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
