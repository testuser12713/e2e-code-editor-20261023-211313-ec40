/**
 * Global keyboard dispatcher. Reads the shortcuts of COMMANDS (including the
 * two-step chord "Ctrl+K Ctrl+O") and runs the command through the registry.
 * A key is only consumed when a handler is registered for its command, so
 * unclaimed keys keep reaching the editor and the browser.
 */
import { COMMANDS, hasHandler, runCommand, type Command } from './registry';

export interface KeyChord {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** Canonical lower-case key name: "a", "0", "/", "plus", "minus", "tab", "up", … */
  key: string;
}

/** The parts of a KeyboardEvent the dispatcher reads (easy to fake in tests). */
export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}

export interface KeyResult {
  /** true when the key was consumed (a command ran, a chord started or a chord was aborted). */
  handled: boolean;
  /** The command that ran, if any. */
  commandId: string | null;
  /** true while waiting for the second key of a chord. */
  pending: boolean;
}

const NAMED_KEYS: Record<string, string> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  '+': 'plus',
  '=': 'plus',
  '-': 'minus',
  ' ': 'space',
  esc: 'escape',
  return: 'enter',
};

const CODE_KEYS: Record<string, string> = {
  NumpadAdd: 'plus',
  NumpadSubtract: 'minus',
  Equal: 'plus',
  Minus: 'minus',
};

const MODIFIERS = new Set(['control', 'shift', 'alt', 'meta', 'altgraph', 'os']);

/** Keys whose character may need Shift on some layouts (e.g. "/" is Shift+7 on German keyboards). */
const SYMBOL_KEYS = new Set(['/', 'plus', 'minus']);

function canonicalKey(name: string): string {
  const lower = name.toLowerCase();
  return NAMED_KEYS[lower] ?? NAMED_KEYS[name] ?? lower;
}

/** Parses "Ctrl+Shift+P" or the chord "Ctrl+K Ctrl+O" into its chords. */
export function parseShortcut(shortcut: string): KeyChord[] {
  return shortcut
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const chord: KeyChord = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
      // "Ctrl++" would be ambiguous; the registry writes "Ctrl+Plus".
      for (const token of part.split('+')) {
        const t = token.toLowerCase();
        if (t === 'ctrl' || t === 'control') chord.ctrl = true;
        else if (t === 'shift') chord.shift = true;
        else if (t === 'alt') chord.alt = true;
        else if (t === 'meta' || t === 'cmd' || t === 'win') chord.meta = true;
        else chord.key = canonicalKey(token);
      }
      return chord;
    });
}

/** Normalises a key event to a chord; null for a lone modifier key. */
export function eventToChord(e: KeyEventLike): KeyChord | null {
  const raw = e.key ?? '';
  if (MODIFIERS.has(raw.toLowerCase())) return null;
  let key = canonicalKey(raw);
  if (key === 'dead' || key === 'unidentified') key = '';
  const code = e.code ?? '';
  // Non-latin layouts type non-latin letters: fall back to the physical letter key.
  if (/^Key[A-Z]$/.test(code) && !/^[a-z]$/.test(key) && key.length <= 1) key = code.slice(3).toLowerCase();
  if (key === '' && /^(Digit|Numpad)[0-9]$/.test(code)) key = code.slice(-1);
  if (key === '' && CODE_KEYS[code]) key = CODE_KEYS[code];
  if (key === '') return null;
  return { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, key };
}

/** true when a pressed chord satisfies a bound chord. */
export function chordMatches(bound: KeyChord, pressed: KeyChord): boolean {
  if (bound.key !== pressed.key) return false;
  if (bound.ctrl !== pressed.ctrl || bound.alt !== pressed.alt || bound.meta !== pressed.meta) return false;
  if (bound.shift === pressed.shift) return true;
  // A symbol bound without Shift may need Shift to be typed at all.
  return !bound.shift && SYMBOL_KEYS.has(bound.key);
}

export interface DispatcherOptions {
  commands?: Command[];
  /** Whether a command can run now; defaults to "a handler is registered". */
  isEnabled?: (id: string) => boolean;
  /** Runs the command; defaults to runCommand. */
  run?: (id: string) => void;
  /** How long the second key of a chord is awaited (ms). */
  chordTimeoutMs?: number;
  now?: () => number;
}

export interface KeybindingDispatcher {
  handleKeyDown(e: KeyEventLike): KeyResult;
  /** Drops a pending chord. */
  reset(): void;
}

const NOT_HANDLED: KeyResult = { handled: false, commandId: null, pending: false };

export function createKeybindingDispatcher(options: DispatcherOptions = {}): KeybindingDispatcher {
  const isEnabled = options.isEnabled ?? hasHandler;
  const run = options.run ?? ((id: string) => void runCommand(id));
  const timeout = options.chordTimeoutMs ?? 2000;
  const now = options.now ?? (() => Date.now());
  const bindings = (options.commands ?? COMMANDS)
    .filter((c) => c.shortcut)
    .map((c) => ({ id: c.id, chords: parseShortcut(c.shortcut as string) }))
    .filter((b) => b.chords.length > 0 && b.chords.length <= 2 && b.chords.every((ch) => ch.key !== ''));

  let pending: { chord: KeyChord; at: number } | null = null;

  function handleKeyDown(e: KeyEventLike): KeyResult {
    if (e.isComposing) return NOT_HANDLED;
    const pressed = eventToChord(e);
    if (!pressed) return pending ? { handled: false, commandId: null, pending: true } : NOT_HANDLED;

    if (pending) {
      const first = pending.chord;
      const fresh = now() - pending.at <= timeout;
      pending = null;
      if (fresh) {
        for (const b of bindings) {
          if (b.chords.length === 2 && chordMatches(b.chords[0], first) && chordMatches(b.chords[1], pressed) && isEnabled(b.id)) {
            run(b.id);
            return { handled: true, commandId: b.id, pending: false };
          }
        }
        // Like VS Code: the second key of an unknown chord is swallowed, not executed.
        return { handled: true, commandId: null, pending: false };
      }
    }

    const startsChord = bindings.some(
      (b) => b.chords.length === 2 && chordMatches(b.chords[0], pressed) && isEnabled(b.id),
    );
    if (startsChord) {
      pending = { chord: pressed, at: now() };
      return { handled: true, commandId: null, pending: true };
    }

    for (const b of bindings) {
      if (b.chords.length === 1 && chordMatches(b.chords[0], pressed) && isEnabled(b.id)) {
        run(b.id);
        return { handled: true, commandId: b.id, pending: false };
      }
    }
    return NOT_HANDLED;
  }

  return {
    handleKeyDown,
    reset() {
      pending = null;
    },
  };
}

type KeyTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Installs the global dispatcher (capture phase, so it sees keys before the
 * editor). Returns the uninstall function. Called once by the app shell.
 */
export function installKeybindings(target: KeyTarget = window, options: DispatcherOptions = {}): () => void {
  const dispatcher = createKeybindingDispatcher(options);
  const onKeyDown = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.defaultPrevented) return;
    const result = dispatcher.handleKeyDown(e);
    if (result.handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  target.addEventListener('keydown', onKeyDown, true);
  return () => target.removeEventListener('keydown', onKeyDown, true);
}
