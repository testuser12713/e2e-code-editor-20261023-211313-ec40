/**
 * Workspace search sidebar (design/mockups/workspace-search.html, the
 * `sidebar-search` region): query with case / whole word / regex toggles,
 * include and exclude globs, results grouped by file with highlighted line
 * previews. A new input cancels the previous search; a click on a result
 * opens the file with that match selected.
 *
 * Registers the command `view.workspaceSearch` (Ctrl+Shift+F): it shows this
 * view and focuses the query field.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp, appStore } from '../state/AppStore';
import { openFile } from '../state/actions';
import { api, errorCode } from '../platform';
import { registerHandler } from '../commands/registry';
import { offsetOfLineColumn } from '../core/workspaceSearch';
import { LIMITS, type SearchMatch, type SearchResponse } from '../types';
import { SidebarHeader } from '../ui/Sidebar';
import { InputGroup, FieldLabel, FieldError } from '../ui/FormField';
import { TextInput } from '../ui/Input';
import { ToggleButton, Badge } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/cn';

/** Delay between the last keystroke and the search it starts. */
export const SEARCH_DEBOUNCE_MS = 250;

/* ---------- command: view.workspaceSearch ---------- */

let focusRequested = false;
const focusListeners = new Set<() => void>();

/** Shows the search view and asks it to focus (and select) the query field. */
export function showWorkspaceSearch(): void {
  focusRequested = true;
  appStore.dispatch({ type: 'sidebar/setView', view: 'search' });
  for (const l of [...focusListeners]) l();
}

registerHandler('view.workspaceSearch', showWorkspaceSearch);

/* ---------- form state that survives switching sidebar views ---------- */

interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  include: string;
  exclude: string;
}

interface Remembered {
  options: SearchOptions;
  workspace: string | null;
  response: SearchResponse | null;
  /** The options `response` answers. */
  answered: SearchOptions | null;
}

const EMPTY_OPTIONS: SearchOptions = { query: '', caseSensitive: false, wholeWord: false, regex: false, include: '', exclude: '' };

let remembered: Remembered = { options: EMPTY_OPTIONS, workspace: null, response: null, answered: null };

let searchCounter = 0;
const nextSearchId = () => `ws-search-${Date.now().toString(36)}-${++searchCounter}`;

/* ---------- result presentation ---------- */

interface LineResult {
  line: number;
  preview: string;
  matches: SearchMatch[];
}

interface FileGroup {
  path: string;
  name: string;
  dir: string;
  count: number;
  lines: LineResult[];
}

function splitPath(path: string, workspace: string | null): { name: string; dir: string } {
  let rel = path;
  if (workspace && path.length > workspace.length && path.startsWith(workspace)) {
    const sep = path[workspace.length];
    if (sep === '\\' || sep === '/') rel = path.slice(workspace.length + 1);
  }
  const i = Math.max(rel.lastIndexOf('\\'), rel.lastIndexOf('/'));
  return i >= 0 ? { name: rel.slice(i + 1), dir: rel.slice(0, i) } : { name: rel, dir: '' };
}

/** Groups a response by file and, inside a file, by line (one row per line, every match highlighted). */
export function groupResults(response: SearchResponse, workspace: string | null): FileGroup[] {
  return response.files
    .filter((f) => f.matches.length > 0)
    .map((f) => {
      const byLine = new Map<number, LineResult>();
      for (const m of f.matches) {
        let row = byLine.get(m.line);
        if (!row) {
          row = { line: m.line, preview: m.preview, matches: [] };
          byLine.set(m.line, row);
        }
        row.matches.push(m);
      }
      return { path: f.path, ...splitPath(f.path, workspace), count: f.matches.length, lines: [...byLine.values()] };
    });
}

/** Characters kept in front of the first match when the line is cut. */
const LEAD_CONTEXT = 24;

/**
 * The preview of one line as React text nodes with `<mark class="hit">`
 * around every match — never HTML from the file. Leading indentation is
 * dropped, and a long run of text in front of the first match is cut to "…".
 */
export function PreviewText({ preview, matches }: { preview: string; matches: SearchMatch[] }): ReactNode {
  const ranges = matches
    .map((m) => ({ start: Math.min(m.start, preview.length), end: Math.min(m.end, preview.length) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const firstStart = ranges.length > 0 ? ranges[0].start : preview.length;
  const indent = preview.length - preview.trimStart().length;
  let from = Math.min(indent, firstStart);
  let ellipsis = false;
  if (firstStart - from > LEAD_CONTEXT * 2) {
    from = firstStart - LEAD_CONTEXT;
    ellipsis = true;
  }
  const parts: ReactNode[] = [];
  if (ellipsis) parts.push('…');
  let pos = from;
  ranges.forEach((r, i) => {
    const start = Math.max(r.start, pos);
    if (r.end <= start) return;
    if (start > pos) parts.push(preview.slice(pos, start));
    parts.push(
      <mark className="hit" key={`hit-${i}`}>
        {preview.slice(start, r.end)}
      </mark>,
    );
    pos = r.end;
  });
  if (pos < preview.length) parts.push(preview.slice(pos));
  return <>{parts}</>;
}

/** Opens the file of a match and selects it (offsets in the editor's LF text). */
export async function openMatch(path: string, match: SearchMatch): Promise<void> {
  let text: string | undefined = appStore.getState().docs[path]?.text;
  if (text === undefined) {
    try {
      const file = await api.fs.readFile(path);
      if (!file.tooLarge) text = file.content;
    } catch (err) {
      // openFile below reports the unreadable file itself; only the selection is lost here.
      console.warn('[search] reading the match position failed:', errorCode(err));
    }
  }
  if (text === undefined) {
    await openFile(path, { line: match.line });
    return;
  }
  await openFile(path, {
    line: match.line,
    selectFrom: offsetOfLineColumn(text, match.line, match.start),
    selectTo: offsetOfLineColumn(text, match.line, match.end),
  });
}

function summaryText(query: string, searching: boolean, total: number, files: number): string {
  if (!query) return 'Type to search the workspace';
  if (searching) return 'Searching…';
  if (total === 0) return '';
  return `${total} result${total === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}`;
}

function sameOptions(a: SearchOptions | null, b: SearchOptions): boolean {
  return (
    !!a &&
    a.query === b.query &&
    a.caseSensitive === b.caseSensitive &&
    a.wholeWord === b.wholeWord &&
    a.regex === b.regex &&
    a.include === b.include &&
    a.exclude === b.exclude
  );
}

/* ---------- the view ---------- */

export function SearchView() {
  const { state } = useApp();
  const workspace = state.workspace;
  const start = remembered.workspace === workspace ? remembered : { options: remembered.options, workspace, response: null, answered: null };

  const [options, setOptions] = useState<SearchOptions>(start.options);
  const [response, setResponse] = useState<SearchResponse | null>(start.response);
  const [answered, setAnswered] = useState<SearchOptions | null>(start.answered);
  const [searching, setSearching] = useState(false);
  const [touched, setTouched] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const queryRef = useRef<HTMLInputElement>(null);
  const pendingId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const id = pendingId.current;
    pendingId.current = null;
    if (id) api.search.cancel(id).catch((err: unknown) => console.warn('[search] cancel failed:', errorCode(err)));
  }, []);

  const runSearch = useCallback(
    (opts: SearchOptions) => {
      cancelPending();
      if (!workspace || opts.query.length === 0) {
        setSearching(false);
        setResponse(null);
        setAnswered(opts);
        return;
      }
      const id = nextSearchId();
      pendingId.current = id;
      setSearching(true);
      api.search
        .run({ id, root: workspace, ...opts })
        .then(
          (res) => res,
          (err: unknown): SearchResponse => ({ id, files: [], truncated: false, timedOut: false, error: errorCode(err) }),
        )
        .then((res) => {
          if (pendingId.current !== id) return; // a newer search replaced this one
          pendingId.current = null;
          setSearching(false);
          setResponse(res);
          setAnswered(opts);
          setCollapsed(new Set());
          setActiveKey(null);
        });
    },
    [workspace, cancelPending],
  );

  const schedule = useCallback(
    (opts: SearchOptions, immediate = false) => {
      cancelPending();
      if (immediate) {
        runSearch(opts);
        return;
      }
      // the previous search is already cancelled; show the new one as pending
      setSearching(opts.query.length > 0 && !!workspace);
      timer.current = setTimeout(() => {
        timer.current = null;
        runSearch(opts);
      }, SEARCH_DEBOUNCE_MS);
    },
    [cancelPending, runSearch, workspace],
  );

  const update = (patch: Partial<SearchOptions>, immediate = false) => {
    const next = { ...options, ...patch };
    setOptions(next);
    setTouched(true);
    schedule(next, immediate);
  };

  // Remember the form and its answer while another sidebar view is shown.
  useEffect(() => {
    remembered = { options, workspace, response, answered };
  }, [options, workspace, response, answered]);

  // A query typed before (another workspace, or a search cut short by switching views) runs again.
  const latest = useRef({ options, answered });
  latest.current = { options, answered };
  const answeredWorkspace = useRef(workspace);
  useEffect(() => {
    const { options: opts, answered: done } = latest.current;
    if (answeredWorkspace.current !== workspace) {
      // another folder was opened: the old results belong to the old folder
      answeredWorkspace.current = workspace;
      setResponse(null);
      setAnswered(null);
      if (opts.query) runSearch(opts);
    } else if (opts.query && !sameOptions(done, opts)) {
      runSearch(opts);
    }
    return cancelPending;
  }, [workspace, runSearch, cancelPending]);

  // Focus requests from view.workspaceSearch (Ctrl+Shift+F).
  useEffect(() => {
    const focus = () => {
      if (!focusRequested) return;
      focusRequested = false;
      const input = queryRef.current;
      if (input && !input.disabled) {
        input.focus();
        input.select();
      }
    };
    focus();
    focusListeners.add(focus);
    return () => {
      focusListeners.delete(focus);
    };
  }, []);

  const groups = useMemo(() => (response && !response.error ? groupResults(response, workspace) : []), [response, workspace]);
  const total = groups.reduce((n, g) => n + g.count, 0);
  const invalidRegex = response?.error === 'invalid-regex' && touched && !searching;
  const failed = response?.error && response.error !== 'invalid-regex' && response.error !== 'cancelled' ? response.error : null;
  const showNoResults = !!options.query && !searching && !!response && !response.error && total === 0;
  const disabled = !workspace;

  const toggleGroup = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const pick = (group: FileGroup, row: LineResult) => {
    setActiveKey(`${group.path}:${row.line}`);
    openMatch(group.path, row.matches[0]).catch((err: unknown) => console.error('[search] opening the result failed:', errorCode(err)));
  };

  return (
    <>
      <SidebarHeader title="Search" />
      <form
        className="search-form"
        role="search"
        data-testid="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          update({}, true);
        }}
      >
        <InputGroup invalid={invalidRegex}>
          <TextInput
            ref={queryRef}
            id="ws-query"
            value={options.query}
            placeholder="Search"
            aria-label="Search text"
            maxLength={LIMITS.maxQueryLength}
            invalid={invalidRegex}
            aria-describedby={invalidRegex ? 'ws-error' : undefined}
            disabled={disabled}
            data-testid="search-query"
            onChange={(e) => update({ query: e.currentTarget.value })}
          />
          <ToggleButton
            label="Match case"
            pressed={options.caseSensitive}
            disabled={disabled}
            data-testid="search-toggle-case"
            onPressedChange={(v) => update({ caseSensitive: v }, true)}
          >
            Aa
          </ToggleButton>
          <ToggleButton
            label="Whole word"
            pressed={options.wholeWord}
            disabled={disabled}
            data-testid="search-toggle-word"
            onPressedChange={(v) => update({ wholeWord: v }, true)}
          >
            ab
          </ToggleButton>
          <ToggleButton
            label="Regular expression"
            pressed={options.regex}
            disabled={disabled}
            data-testid="search-toggle-regex"
            onPressedChange={(v) => update({ regex: v }, true)}
          >
            .*
          </ToggleButton>
        </InputGroup>
        {invalidRegex ? <FieldError id="ws-error">Invalid regular expression</FieldError> : null}
        <FieldLabel htmlFor="ws-include">Files to include</FieldLabel>
        <TextInput
          id="ws-include"
          mono
          value={options.include}
          placeholder="e.g. src/**, *.ts"
          disabled={disabled}
          data-testid="search-include"
          onChange={(e) => update({ include: e.currentTarget.value })}
        />
        <FieldLabel htmlFor="ws-exclude">Files to exclude</FieldLabel>
        <TextInput
          id="ws-exclude"
          mono
          value={options.exclude}
          placeholder="e.g. test/**, *.md"
          disabled={disabled}
          data-testid="search-exclude"
          onChange={(e) => update({ exclude: e.currentTarget.value })}
        />
      </form>
      <div className="search-summary" aria-live="polite" data-testid="search-summary">
        {disabled ? 'Open a folder to search across its files.' : summaryText(options.query, searching, total, groups.length)}
      </div>
      <div className="sidebar-body" data-testid="search-results">
        {groups.map((group) => {
          const open = !collapsed.has(group.path);
          return (
            <section className="result-group" aria-expanded={open} data-path={group.path} key={group.path} data-testid="result-group">
              <button
                className="result-file"
                type="button"
                aria-expanded={open}
                title={group.path}
                onClick={() => toggleGroup(group.path)}
              >
                <Icon name="chevron-right" className="tree-chevron" />
                <span className="result-file-name">{group.name}</span>
                <span className="result-file-dir">{group.dir}</span>
                <Badge>{group.count}</Badge>
              </button>
              {open ? (
                <div className="result-lines">
                  {group.lines.map((row) => {
                    const key = `${group.path}:${row.line}`;
                    return (
                      <button
                        className={cn('result-line', activeKey === key && 'is-active')}
                        type="button"
                        key={key}
                        data-line={row.line}
                        data-testid="result-line"
                        title={`${group.name}:${row.line}`}
                        onClick={() => pick(group, row)}
                      >
                        <span className="ln">{row.line}</span>
                        <span className="result-text">
                          <PreviewText preview={row.preview} matches={row.matches} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
        {response?.truncated && !searching ? (
          <div className="notice" role="status" data-testid="search-truncated">
            Only the first {LIMITS.maxSearchMatches} results are shown. Narrow the search or the include pattern to see the rest.
          </div>
        ) : null}
        {response?.timedOut && !searching ? (
          <div className="notice" role="status" data-testid="search-timeout">
            The search stopped after {LIMITS.searchTimeoutMs / 1000} seconds, so the results may be incomplete.
          </div>
        ) : null}
        {failed && !searching ? (
          <div className="notice" role="alert" data-testid="search-error">
            The search failed ({failed}).
          </div>
        ) : null}
        {showNoResults ? (
          <div className="notice" data-testid="search-empty">
            No results found. Check the spelling, the options and the include/exclude patterns.
          </div>
        ) : null}
      </div>
    </>
  );
}
