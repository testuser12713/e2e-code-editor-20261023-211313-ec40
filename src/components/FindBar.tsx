/**
 * Find and replace in the current file (Ctrl+F / Ctrl+H) with case, whole
 * word and regex toggles and a match counter. Shown while state.findOpen is
 * set (design/mockups/find-replace.html).
 *
 * Built on @codemirror/search: the bar owns the inputs, the editor owns the
 * search state. The bar installs the search state into the active editor on
 * first use with an invisible panel, so CodeMirror's own match highlighting
 * runs while the bar is open, and drives findNext / findPrevious /
 * replaceNext / replaceAll against getActiveView().
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import { EditorSelection, StateEffect, type EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  setSearchQuery,
} from '@codemirror/search';
import { useApp } from '../state/AppStore';
import { registerHandler } from '../commands/registry';
import { getActiveView } from '../editor/keymaps';
import { FieldError, IconButton, InputGroup, TextInput, ToggleButton } from '../ui';

export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

/** Upper bound for counting; beyond it the counter shows "N+". */
export const MAX_COUNTED_MATCHES = 10000;

/**
 * The error message for an invalid regular expression, or null when the
 * pattern compiles (or regex mode is off / the pattern is empty).
 * Same flags as @codemirror/search uses, so "valid here" means "valid there".
 */
export function regexError(pattern: string, regex: boolean): string | null {
  if (!regex || pattern === '') return null;
  try {
    new RegExp(pattern, 'gmu');
    return null;
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const reason = raw.replace(/^.*:\s*/, '').trim();
    return `Invalid regular expression: ${reason || 'syntax error'}`;
  }
}

export function buildQuery(text: string, replace: string, opts: FindOptions): SearchQuery {
  return new SearchQuery({
    search: text,
    replace,
    caseSensitive: opts.caseSensitive,
    wholeWord: opts.wholeWord,
    regexp: opts.regex,
  });
}

export interface MatchCount {
  total: number;
  /** 1-based index of the match the main selection sits on, 0 when none. */
  current: number;
  /** true when counting stopped at MAX_COUNTED_MATCHES. */
  capped: boolean;
}

/** Counts the matches of `query` in `state` and locates the selected one. */
export function countMatches(state: EditorState, query: SearchQuery): MatchCount {
  if (!query.valid) return { total: 0, current: 0, capped: false };
  const sel = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let current = 0;
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    const { from, to } = r.value;
    if (from === to) continue;
    total++;
    if (current === 0 && from === sel.from && to === sel.to) current = total;
    if (total >= MAX_COUNTED_MATCHES) return { total, current, capped: true };
  }
  return { total, current, capped: false };
}

/** The counter text of the design: "1 of 9", "No results", "—" for an invalid pattern. */
export function counterLabel(text: string, invalid: boolean, count: MatchCount): string {
  if (invalid) return '—';
  if (text === '' || count.total === 0) return 'No results';
  const total = count.capped ? `${count.total}+` : String(count.total);
  return count.current > 0 ? `${count.current} of ${total}` : `? of ${total}`;
}

/* ---------- editor wiring ---------- */

/** Editors that already carry the bar's search configuration. */
const configured = new WeakSet<EditorView>();

const searchTheme = EditorView.theme({
  '.cm-searchMatch': { backgroundColor: 'var(--c-match)', borderRadius: '2px' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--c-match-current)' },
  '.cm-panels.cm-panels-bottom, .cm-panels.cm-panels-top': { border: 'none' },
});

/** The search state is shown through this invisible panel; the bar is the visible UI. */
function hiddenPanel() {
  const dom = document.createElement('div');
  dom.hidden = true;
  dom.className = 'cm-findbar-anchor';
  return { dom };
}

/** Installs the search state (once per editor) and turns its highlighting on. */
function ensureSearch(view: EditorView): void {
  if (!configured.has(view)) {
    configured.add(view);
    view.dispatch({ effects: StateEffect.appendConfig.of([search({ createPanel: hiddenPanel }), searchTheme]) });
  }
  if (!searchPanelOpen(view.state)) openSearchPanel(view);
}

/** Selects the first match at or after the selection start (wrapping), without moving focus. */
function revealFirstMatch(view: EditorView, query: SearchQuery): void {
  if (!query.valid) return;
  const state = view.state;
  const start = state.selection.main.from;
  let target: { from: number; to: number } | null = null;
  let first: { from: number; to: number } | null = null;
  const cursor = query.getCursor(state);
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    if (r.value.from === r.value.to) continue;
    if (!first) first = r.value;
    if (r.value.from >= start) {
      target = r.value;
      break;
    }
  }
  const hit = target ?? first;
  if (!hit) return;
  view.dispatch({
    selection: EditorSelection.single(hit.from, hit.to),
    effects: EditorView.scrollIntoView(hit.from, { y: 'center' }),
  });
}

/** The current selection as a find-field seed: short and on one line, else nothing. */
function selectionSeed(view: EditorView | null): string {
  if (!view) return '';
  const sel = view.state.selection.main;
  if (sel.empty || sel.to - sel.from > 200) return '';
  const text = view.state.sliceDoc(sel.from, sel.to);
  return text.includes('\n') ? '' : text;
}

/* ---------- component ---------- */

export function FindBar() {
  const { state, dispatch } = useApp();
  const mode = state.findOpen;
  const activeTab = state.activeTab;
  const doc = activeTab ? state.docs[activeTab] : undefined;
  const open = mode !== null && activeTab !== null;

  const [text, setText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [opts, setOpts] = useState<FindOptions>({ caseSensitive: false, wholeWord: false, regex: false });
  const [touched, setTouched] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const focusTarget = useRef<'find' | 'replace'>('find');
  const textRef = useRef(text);
  textRef.current = text;

  // Ctrl+F / Ctrl+H (and the menu, the palette) open the bar.
  useEffect(() => {
    const openBar = (target: 'find' | 'replace') => {
      const seed = selectionSeed(getActiveView());
      if (seed) {
        setText(seed);
        setTouched(false);
      }
      focusTarget.current = target === 'replace' && (seed || textRef.current) ? 'replace' : 'find';
      dispatch({ type: 'find/set', findOpen: target });
      setFocusRequest((n) => n + 1);
    };
    const offs = [registerHandler('view.find', () => openBar('find')), registerHandler('view.replace', () => openBar('replace'))];
    return () => offs.forEach((off) => off());
  }, [dispatch]);

  // A fresh opening starts neutral: no error until the user types again.
  useEffect(() => {
    if (!open) setTouched(false);
  }, [open]);

  useEffect(() => {
    if (!open || focusRequest === 0) return;
    const el = focusTarget.current === 'replace' ? replaceRef.current : findRef.current;
    el?.focus();
    el?.select();
  }, [focusRequest, open]);

  const error = regexError(text, opts.regex);
  const query = useMemo(() => buildQuery(text, replaceText, opts), [text, replaceText, opts]);

  // Push the query into the active editor; reveal the first match when the pattern changes.
  const lastPattern = useRef<string>('');
  useEffect(() => {
    const view = getActiveView();
    if (!open || !view) return;
    ensureSearch(view);
    view.dispatch({ effects: setSearchQuery.of(query) });
    const key = `${activeTab}\u0000${text}\u0000${opts.caseSensitive}${opts.wholeWord}${opts.regex}`;
    if (key !== lastPattern.current) {
      lastPattern.current = key;
      revealFirstMatch(view, query);
    }
    rerender();
  }, [open, activeTab, text, opts, query]);

  // Closing the bar removes the highlighting.
  useEffect(() => {
    if (open) return;
    lastPattern.current = '';
    const view = getActiveView();
    if (view && searchPanelOpen(view.state)) closeSearchPanel(view);
  }, [open]);

  const close = useCallback(() => {
    dispatch({ type: 'find/set', findOpen: null });
    const view = getActiveView();
    if (view) {
      if (searchPanelOpen(view.state)) closeSearchPanel(view);
      view.focus();
    }
  }, [dispatch]);

  if (!open) return null;

  const view = getActiveView();
  // doc text and cursor in the store change with every edit / move, which re-renders the counter
  void doc?.text;
  void state.cursor;
  const count: MatchCount = view && !error ? countMatches(view.state, query) : { total: 0, current: 0, capped: false };
  const hasMatches = count.total > 0;
  const readOnly = doc?.readOnly ?? false;
  const canReplace = hasMatches && !readOnly && view !== null;

  const run = (cmd: (v: EditorView) => boolean) => {
    const v = getActiveView();
    if (!v) return;
    ensureSearch(v);
    v.dispatch({ effects: setSearchQuery.of(query) });
    cmd(v);
    rerender();
  };

  const onFindKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (hasMatches) run(e.shiftKey ? findPrevious : findNext);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const onReplaceKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canReplace) run(replaceNext);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const toggle = (key: keyof FindOptions) => (pressed: boolean) => setOpts((o) => ({ ...o, [key]: pressed }));
  const showError = touched && error !== null;

  return (
    <div
      className="findbar"
      role="search"
      aria-label="Find and replace"
      data-testid="find-bar"
      data-mode={mode}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <div className="findbar-row">
        <InputGroup invalid={showError}>
          <TextInput
            ref={findRef}
            id="find-input"
            value={text}
            placeholder="Find"
            aria-label="Find"
            invalid={showError}
            aria-describedby={showError ? 'find-error' : undefined}
            data-testid="find-input"
            onChange={(e) => {
              setText(e.currentTarget.value);
              setTouched(true);
            }}
            onKeyDown={onFindKey}
          />
          <ToggleButton pressed={opts.caseSensitive} onPressedChange={toggle('caseSensitive')} label="Match case" data-testid="find-toggle-case">
            Aa
          </ToggleButton>
          <ToggleButton pressed={opts.wholeWord} onPressedChange={toggle('wholeWord')} label="Whole word" data-testid="find-toggle-word">
            ab
          </ToggleButton>
          <ToggleButton pressed={opts.regex} onPressedChange={toggle('regex')} label="Regular expression" data-testid="find-toggle-regex">
            .*
          </ToggleButton>
        </InputGroup>
        <span className="findbar-count" id="find-count" aria-live="polite" data-testid="find-count">
          {counterLabel(text, error !== null, count)}
        </span>
        <IconButton
          icon="arrow-up"
          label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={!hasMatches}
          data-testid="find-prev"
          onClick={() => run(findPrevious)}
        />
        <IconButton
          icon="arrow-down"
          label="Next match"
          title="Next match (Enter)"
          disabled={!hasMatches}
          data-testid="find-next"
          onClick={() => run(findNext)}
        />
        <IconButton icon="close" label="Close find" title="Close (Esc)" data-testid="find-close" onClick={close} />
      </div>
      {showError ? <FieldError id="find-error">{error}</FieldError> : null}
      {mode === 'replace' ? (
        <div className="findbar-row">
          <InputGroup>
            <TextInput
              ref={replaceRef}
              id="replace-input"
              value={replaceText}
              placeholder="Replace"
              aria-label="Replace with"
              data-testid="replace-input"
              onChange={(e) => setReplaceText(e.currentTarget.value)}
              onKeyDown={onReplaceKey}
            />
          </InputGroup>
          <IconButton
            icon="replace"
            label="Replace"
            title="Replace (Enter)"
            disabled={!canReplace}
            data-testid="find-replace-one"
            onClick={() => run(replaceNext)}
          />
          <IconButton
            icon="replace-all"
            label="Replace all"
            title="Replace all"
            disabled={!canReplace}
            data-testid="find-replace-all"
            onClick={() => run(replaceAll)}
          />
        </div>
      ) : null}
    </div>
  );
}
