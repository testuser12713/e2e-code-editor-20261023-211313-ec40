/**
 * Opens a file in a tab (reading it through the bridge, detecting language,
 * line ending and indentation), optionally jumping to a line or selecting a
 * range. Uses the module-level `appStore` handle, so it can be called from
 * anywhere (explorer, quick open, search results, command handlers).
 */
import { api } from '../platform';
import { detectLanguage } from '../core/language';
import { normalizeToLf } from '../core/lineEndings';
import type { Doc, ReadFileResult } from '../types';
import { appStore, type AppStoreHandle } from './AppStore';

export interface OpenFileOptions {
  /** 1-based line to reveal. */
  line?: number;
  /** Document offsets of a range to select (e.g. a search match). */
  selectFrom?: number;
  selectTo?: number;
  /** Open as an italic preview tab (single click). Defaults to false. */
  preview?: boolean;
}

/** Where the editor should put the cursor once the doc is shown. */
export interface RevealRequest {
  line?: number;
  selectFrom?: number;
  selectTo?: number;
}

const pendingReveals = new Map<string, RevealRequest>();
const revealListeners = new Set<(path: string) => void>();

/** Hands the editor host the reveal request of `path` (once). */
export function takeReveal(path: string): RevealRequest | undefined {
  const r = pendingReveals.get(path);
  pendingReveals.delete(path);
  return r;
}

/** The editor host listens here for reveal requests on the doc it already shows. */
export function onReveal(cb: (path: string) => void): () => void {
  revealListeners.add(cb);
  return () => {
    revealListeners.delete(cb);
  };
}

function requestReveal(path: string, opts: OpenFileOptions): void {
  const wantsLine = typeof opts.line === 'number' && Number.isFinite(opts.line);
  const wantsSel = typeof opts.selectFrom === 'number' && Number.isFinite(opts.selectFrom);
  if (!wantsLine && !wantsSel) return;
  pendingReveals.set(path, {
    line: wantsLine ? opts.line : undefined,
    selectFrom: wantsSel ? opts.selectFrom : undefined,
    selectTo: wantsSel && typeof opts.selectTo === 'number' ? opts.selectTo : undefined,
  });
  for (const l of [...revealListeners]) l(path);
}

/**
 * Guesses the indentation of a text: tabs when more indented lines start with
 * a tab, else the most common step between space indents (2, 4 or 8).
 * Falls back to `fallback` when the text has no indented lines.
 */
export function detectIndent(text: string, fallback: Doc['indent']): Doc['indent'] {
  let tabs = 0;
  let spaces = 0;
  const steps = new Map<number, number>();
  let prev = 0;
  const lines = text.split('\n', 5000);
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (line.startsWith('\t')) {
      tabs++;
      continue;
    }
    const n = line.length - line.replace(/^ +/, '').length;
    if (n > 0) spaces++;
    const step = Math.abs(n - prev);
    if (step >= 2 && step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1);
    prev = n;
  }
  if (tabs === 0 && spaces === 0) return { ...fallback };
  if (tabs > spaces) return { useTabs: true, size: fallback.size };
  let best = fallback.size;
  let bestCount = 0;
  for (const [step, count] of steps) {
    if (count > bestCount || (count === bestCount && step < best)) {
      best = step;
      bestCount = count;
    }
  }
  return { useTabs: false, size: best };
}

/** Builds the Doc of a freshly read file. Files over 5 MB become read-only and empty. */
export function docFromRead(path: string, result: ReadFileResult, fallbackIndent: Doc['indent']): Doc {
  const text = result.tooLarge ? '' : normalizeToLf(result.content ?? '');
  return {
    path,
    text,
    savedText: text,
    eol: result.eol === 'crlf' ? 'crlf' : 'lf',
    language: detectLanguage(path),
    indent: result.tooLarge ? { ...fallbackIndent } : detectIndent(text, fallbackIndent),
    readOnly: result.tooLarge,
    tooLarge: result.tooLarge,
    conflict: false,
  };
}

const inFlight = new Map<string, Promise<void>>();

async function loadDoc(store: AppStoreHandle, path: string): Promise<void> {
  const running = inFlight.get(path);
  if (running) return running;
  const job = (async () => {
    const result = await api.fs.readFile(path);
    const { settings } = store.getState();
    const doc = docFromRead(path, result, { useTabs: !settings.insertSpaces, size: settings.tabSize });
    if (!store.getState().docs[path]) store.dispatch({ type: 'doc/open', doc });
  })();
  inFlight.set(path, job);
  try {
    await job;
  } finally {
    inFlight.delete(path);
  }
}

/**
 * Opens `path` in a tab and makes it active. A file that is already open is
 * only focused (and pinned when opened permanently). Rejects with the bridge's
 * error code when the file cannot be read.
 */
export async function openFile(path: string, opts: OpenFileOptions = {}, store: AppStoreHandle = appStore): Promise<void> {
  if (typeof path !== 'string' || path === '') throw new Error('invalid-path');
  const preview = opts.preview === true;
  if (!store.getState().docs[path]) await loadDoc(store, path);
  store.dispatch({ type: 'tab/open', path, preview });
  requestReveal(path, opts);
}
