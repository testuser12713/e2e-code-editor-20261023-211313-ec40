/**
 * Editor host: one CodeMirror view for the active tab, the large-file
 * read-only warning, and the active-view registration (setActiveView)
 * (design/mockups/editor.html, large-file.html).
 *
 * Every open document keeps its own EditorState (undo history, selection,
 * folds) and scroll position; switching tabs swaps the state of the one view.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorSelection, EditorState, type StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useApp, useAppStore, type AppStoreHandle } from '../state/AppStore';
import { onReveal, takeReveal, type RevealRequest } from '../state/openFile';
import {
  buildExtensions,
  cursorOf,
  indentCompartment,
  indentExtension,
  readOnlyCompartment,
  readOnlyExtension,
  syncFromStore,
} from '../editor/extensions';
import { setActiveView } from '../editor/keymaps';
import { setEditorLanguage } from '../editor/languages';
import { applySettingsToView } from '../editor/settingsExtensions';
import { api, errorCode } from '../platform';
import type { Doc, LanguageId, Tab } from '../types';
import { Banner } from '../ui/Banner';
import { Icon } from '../ui/Icon';
import { Welcome } from '../views/Welcome';

/** One open document's editor state, kept while its tab is open. */
interface Entry {
  path: string;
  state: EditorState;
  scroll: StateEffect<unknown> | null;
  /** The text last exchanged with the store (skips needless comparisons). */
  lastText: string;
  language: LanguageId;
  indent: Doc['indent'];
  readOnly: boolean;
}

interface EditorHost {
  entries: Map<string, Entry>;
  shown: Entry | null;
}

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i >= 0 ? path.slice(i + 1) : path;
}

/** "12.4 MB" style size. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** Puts the cursor on a line or selects a range, scrolled to the middle. */
export function applyReveal(view: EditorView, req: RevealRequest): void {
  const doc = view.state.doc;
  const clamp = (n: number) => Math.min(Math.max(Math.trunc(n), 0), doc.length);
  let selection: EditorSelection;
  if (typeof req.selectFrom === 'number') {
    const from = clamp(req.selectFrom);
    const to = clamp(typeof req.selectTo === 'number' ? req.selectTo : from);
    selection = EditorSelection.single(from, to);
  } else if (typeof req.line === 'number') {
    const n = Math.min(Math.max(Math.trunc(req.line), 1), doc.lines);
    selection = EditorSelection.single(doc.line(n).from);
  } else {
    return;
  }
  view.dispatch({ selection, effects: EditorView.scrollIntoView(selection.main, { y: 'center' }), userEvent: 'select' });
  view.focus();
}

/** Follows renames (tab positions stay, paths change) and forgets closed docs. */
function reconcileEntries(host: EditorHost, prevTabs: Tab[], tabs: Tab[], docs: Record<string, Doc>): void {
  if (prevTabs.length === tabs.length) {
    const now = new Set(tabs.map((t) => t.path));
    prevTabs.forEach((old, i) => {
      const np = tabs[i].path;
      if (old.path === np || now.has(old.path)) return;
      const entry = host.entries.get(old.path);
      if (!entry || host.entries.has(np)) return;
      host.entries.delete(old.path);
      entry.path = np;
      host.entries.set(np, entry);
    });
  }
  for (const p of [...host.entries.keys()]) {
    if (!docs[p]) host.entries.delete(p);
  }
}

/** Brings the view's text, language, indentation and read-only state in line with the doc. */
function syncViewWithDoc(view: EditorView, entry: Entry, doc: Doc): void {
  if (doc.text !== entry.lastText) {
    entry.lastText = doc.text;
    if (view.state.doc.toString() !== doc.text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: doc.text },
        annotations: syncFromStore.of(true),
      });
    }
  }
  if (doc.language !== entry.language) {
    entry.language = doc.language;
    setEditorLanguage(view, doc.language).catch((err: unknown) => console.warn('[editor] language switch failed:', errorCode(err)));
  }
  if (doc.indent.useTabs !== entry.indent.useTabs || doc.indent.size !== entry.indent.size) {
    entry.indent = doc.indent;
    view.dispatch({ effects: indentCompartment.reconfigure(indentExtension(doc.indent)) });
  }
  if (doc.readOnly !== entry.readOnly) {
    entry.readOnly = doc.readOnly;
    view.dispatch({ effects: readOnlyCompartment.reconfigure(readOnlyExtension(doc.readOnly)) });
  }
}

/**
 * Moves the keyboard focus into the editor after a file was opened (from the
 * welcome screen, the explorer, a search result …) or its tab was made
 * permanent, so typing goes straight into the document. The focus is left
 * alone while the user is in a text field or a dialog, and when it already is
 * in the editor.
 */
export function focusEditorAfterOpen(view: EditorView): void {
  if (typeof document === 'undefined') return;
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body) {
    if (view.dom.contains(active)) return;
    if (active.closest('[role="dialog"], [role="alertdialog"]')) return;
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) return;
  }
  view.focus();
}

function createEntry(host: EditorHost, store: AppStoreHandle, doc: Doc): Entry {
  const entry: Entry = {
    path: doc.path,
    state: EditorState.create({ doc: '' }),
    scroll: null,
    lastText: doc.text,
    language: doc.language,
    indent: doc.indent,
    readOnly: doc.readOnly,
  };
  entry.state = EditorState.create({
    doc: doc.text,
    extensions: buildExtensions({
      doc,
      settings: store.getState().settings,
      onDocChanged: (text) => {
        entry.lastText = text;
        store.dispatch({ type: 'doc/setText', path: entry.path, text });
        // The first edit makes a preview tab permanent.
        if (store.getState().tabs.some((t) => t.path === entry.path && t.preview)) {
          store.dispatch({ type: 'tab/pin', path: entry.path });
        }
      },
      onCursor: (cursor) => {
        if (host.shown === entry) store.dispatch({ type: 'cursor/set', cursor });
      },
    }),
  });
  return entry;
}

function CodeEditor({ host, path }: { host: EditorHost; path: string }) {
  const { state } = useApp();
  const store = useAppStore();
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const doc = state.docs[path];

  // One view for the lifetime of this host.
  useLayoutEffect(() => {
    const view = new EditorView({ parent: parentRef.current ?? undefined });
    viewRef.current = view;
    setActiveView(view);
    return () => {
      const shown = host.shown;
      if (shown && host.entries.get(shown.path) === shown) {
        shown.state = view.state;
        shown.scroll = view.scrollSnapshot();
      }
      host.shown = null;
      viewRef.current = null;
      setActiveView(null);
      view.destroy();
    };
  }, [host]);

  // Swap in the state of the active document.
  useLayoutEffect(() => {
    const view = viewRef.current;
    const current = store.getState().docs[path];
    if (!view || !current) return;
    let entry = host.entries.get(path);
    if (entry && host.shown === entry) return;
    const prev = host.shown;
    if (prev && host.entries.get(prev.path) === prev) {
      prev.state = view.state;
      prev.scroll = view.scrollSnapshot();
    }
    if (!entry) {
      entry = createEntry(host, store, current);
      host.entries.set(path, entry);
    }
    host.shown = entry;
    view.setState(entry.state);
    applySettingsToView(view, store.getState().settings);
    syncViewWithDoc(view, entry, current);
    if (entry.scroll) view.dispatch({ effects: entry.scroll });
    store.dispatch({ type: 'cursor/set', cursor: cursorOf(view.state) });
    const reveal = takeReveal(path);
    if (reveal) applyReveal(view, reveal);
    // A file that was just opened or switched to takes the keyboard; the
    // neighbour that is shown because the active tab was closed does not.
    const opened = !prev || store.getState().tabs.some((t) => t.path === prev.path);
    if (opened) focusEditorAfterOpen(view);
  }, [host, store, path]);

  // Making the tab permanent (double click in the explorer or on the tab) also
  // means "I want to edit this": the typing goes into the editor.
  const preview = state.tabs.find((t) => t.path === path)?.preview ?? false;
  const lastPreview = useRef({ path, preview });
  useEffect(() => {
    const view = viewRef.current;
    const last = lastPreview.current;
    if (view && last.path === path && last.preview && !preview) focusEditorAfterOpen(view);
    lastPreview.current = { path, preview };
  }, [path, preview]);

  // Reveal requests for the document that is already shown.
  useEffect(
    () =>
      onReveal((p) => {
        const view = viewRef.current;
        if (!view || !host.shown || host.shown.path !== p) return;
        const req = takeReveal(p);
        if (req) applyReveal(view, req);
      }),
    [host],
  );

  // Changes that arrive through the store (reload, save transform, language, indentation).
  useEffect(() => {
    const view = viewRef.current;
    const entry = host.shown;
    if (!view || !doc || !entry || entry.path !== doc.path) return;
    syncViewWithDoc(view, entry, doc);
  }, [host, doc]);

  // Live settings (font, tab size, wrap …).
  useEffect(() => {
    if (viewRef.current) applySettingsToView(viewRef.current, state.settings);
  }, [state.settings]);

  return <div className="editor-host" data-testid="editor-host" data-path={path} ref={parentRef} />;
}

function LargeFileView({ doc }: { doc: Doc }) {
  const [size, setSize] = useState<number | null>(null);
  const { dispatch } = useApp();

  useEffect(() => {
    let alive = true;
    setSize(null);
    dispatch({ type: 'cursor/set', cursor: { line: 1, col: 1, selLength: 0 } });
    api.fs.stat(doc.path).then(
      (s) => {
        if (alive) setSize(s.size);
      },
      (err: unknown) => console.warn('[editor] stat failed:', errorCode(err)),
    );
    return () => {
      alive = false;
    };
  }, [doc.path, dispatch]);

  const name = baseName(doc.path);
  const sizeText = size !== null ? formatSize(size) : '';
  return (
    <>
      <Banner icon="lock" testId="large-file-banner">
        <strong>Read-only:</strong> {name} is {sizeText ? `${sizeText}, ` : ''}above the 5 MB limit. It is opened read-only so the
        editor stays responsive.
      </Banner>
      <div className="editor-host" data-testid="editor-host" data-path={doc.path}>
        <div className="editor-overlay-msg" data-testid="large-file-message">
          <Icon name="lock" />
          <h2>This file is too large to edit</h2>
          <p>Content of files over 5 MB is not loaded.</p>
        </div>
      </div>
    </>
  );
}

export function EditorPane() {
  const { state } = useApp();
  const store = useAppStore();
  const [host] = useState<EditorHost>(() => ({ entries: new Map(), shown: null }));

  useEffect(() => {
    let prevTabs = store.getState().tabs;
    let prevDocs = store.getState().docs;
    reconcileEntries(host, prevTabs, prevTabs, prevDocs);
    return store.subscribe(() => {
      const s = store.getState();
      if (s.tabs === prevTabs && s.docs === prevDocs) return;
      reconcileEntries(host, prevTabs, s.tabs, s.docs);
      prevTabs = s.tabs;
      prevDocs = s.docs;
    });
  }, [host, store]);

  const path = state.activeTab;
  const doc = path ? state.docs[path] : undefined;
  if (!path) return <Welcome />;
  if (!doc) return <div className="editor-host" data-testid="editor-host" aria-busy="true" />;
  if (doc.tooLarge) return <LargeFileView doc={doc} />;
  return <CodeEditor host={host} path={path} />;
}
