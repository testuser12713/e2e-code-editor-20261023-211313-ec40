import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useApp, type AppStoreHandle, useAppStore } from '../state/AppStore';
import { registerHandler } from '../commands/registry';
import { LANGUAGE_IDS, LANGUAGE_NAMES, setEditorLanguage } from '../editor/languages';
import { getActiveView } from '../editor/keymaps';
import { Icon, Menu, MenuItem, StatusBarFrame, StatusGroup, StatusItem, Toast } from '../ui';
import type { Cursor, Doc, LanguageId } from '../types';

/**
 * Status bar (design/mockups/editor.html `footer.statusbar`, welcome.html):
 * cursor position and selection, read-only marker, language mode (picker),
 * indentation (picker), line ending (click toggles LF/CRLF) and the encoding.
 * The pickers are also reachable through the commands editor.changeLanguage,
 * editor.changeIndent and editor.toggleEol.
 */

export type Indent = Doc['indent'];

/** Indentation choices of the picker (design/mockups/app.js INDENT_LIST). */
export const INDENT_OPTIONS: Indent[] = [
  { useTabs: false, size: 2 },
  { useTabs: false, size: 4 },
  { useTabs: false, size: 8 },
  { useTabs: true, size: 4 },
];

export function indentLabel(indent: Indent): string {
  return `${indent.useTabs ? 'Tabs' : 'Spaces'}: ${indent.size}`;
}

export function cursorLabel(c: Cursor): string {
  return `Ln ${c.line}, Col ${c.col}${c.selLength > 0 ? ` (${c.selLength} selected)` : ''}`;
}

/**
 * Appended to `savedText` while the doc's line ending differs from the one on
 * disk. Dirty is `text !== savedText` everywhere in the app (title, tab dot,
 * save prompt, Save All), so this marks the doc dirty without touching its
 * text; the next save (doc/setSaved) or reload replaces savedText and with it
 * the marker. Toggling back to the ending on disk removes it again.
 */
export const EOL_CHANGED_MARKER = '\u0000eol-changed';

/** Toggles LF/CRLF of the doc at `path` and marks it dirty. Returns the new ending. */
export function toggleDocEol(store: AppStoreHandle, path: string): Doc['eol'] | null {
  const doc = store.getState().docs[path];
  if (!doc || doc.readOnly || doc.tooLarge) return null;
  const eol = doc.eol === 'lf' ? 'crlf' : 'lf';
  const savedText = doc.savedText.endsWith(EOL_CHANGED_MARKER)
    ? doc.savedText.slice(0, -EOL_CHANGED_MARKER.length)
    : doc.savedText + EOL_CHANGED_MARKER;
  store.dispatch({ type: 'doc/setEol', path, eol });
  store.dispatch({ type: 'doc/setSaved', path, savedText });
  store.dispatch({ type: 'tab/pin', path });
  return eol;
}

/** Changes the language mode of the doc and re-highlights the live editor. */
export function changeDocLanguage(store: AppStoreHandle, path: string, language: LanguageId): void {
  if (!store.getState().docs[path]) return;
  store.dispatch({ type: 'doc/setLanguage', path, language });
  const view = getActiveView();
  if (view && store.getState().activeTab === path) {
    setEditorLanguage(view, language).catch((err: unknown) =>
      console.error('[status] language switch failed:', err instanceof Error ? err.name : 'unknown-error'),
    );
  }
}

export function changeDocIndent(store: AppStoreHandle, path: string, indent: Indent): void {
  if (!store.getState().docs[path]) return;
  store.dispatch({ type: 'doc/setIndent', path, indent });
}

function isLanguageId(v: unknown): v is LanguageId {
  return typeof v === 'string' && (LANGUAGE_IDS as string[]).includes(v);
}

function isIndent(v: unknown): v is Indent {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.useTabs === 'boolean' && typeof o.size === 'number' && Number.isInteger(o.size) && o.size >= 1 && o.size <= 16;
}

type Picker = 'language' | 'indent';

/** A status item that can be pressed, or is visibly unavailable while no file is open. */
function StatusButton({
  children,
  title,
  disabled,
  onPress,
  testId,
  buttonRef,
  expanded,
}: {
  children: ReactNode;
  title: string;
  disabled: boolean;
  onPress: () => void;
  testId: string;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  expanded?: boolean;
}) {
  if (!disabled) {
    if (buttonRef) {
      return (
        <button
          ref={buttonRef}
          className="status-item"
          type="button"
          title={title}
          onClick={onPress}
          data-testid={testId}
          aria-haspopup="menu"
          aria-expanded={expanded ?? false}
        >
          {children}
        </button>
      );
    }
    return (
      <StatusItem title={title} onPress={onPress} testId={testId}>
        {children}
      </StatusItem>
    );
  }
  return (
    <button className="status-item" type="button" title="Open a file first" disabled aria-disabled="true" data-testid={testId}>
      {children}
    </button>
  );
}

export function StatusBar() {
  const { state } = useApp();
  const store = useAppStore();
  const doc: Doc | undefined = state.activeTab ? state.docs[state.activeTab] : undefined;
  const hasDoc = doc !== undefined;
  const editable = hasDoc && !doc.readOnly && !doc.tooLarge;

  const [picker, setPicker] = useState<Picker | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [toast, setToast] = useState<string | null>(null);
  const anchors = useRef<Record<Picker, HTMLButtonElement | null>>({ language: null, indent: null });
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closePicker = useCallback(() => {
    if (picker) anchors.current[picker]?.focus();
    setPicker(null);
  }, [picker]);

  const openPicker = useCallback((kind: Picker) => {
    const path = store.getState().activeTab;
    if (!path || !store.getState().docs[path]) return;
    setPicker((p) => (p === kind ? null : kind));
  }, [store]);

  const toggleEol = useCallback(() => {
    const path = store.getState().activeTab;
    if (!path) return;
    const eol = toggleDocEol(store, path);
    if (eol) setToast(`Line endings: ${eol.toUpperCase()} (applied on save)`);
  }, [store]);

  /* Commands: registered only while a file is open, so menus show them disabled otherwise. */
  useEffect(() => {
    if (!hasDoc) return;
    const offs = [
      registerHandler('editor.changeLanguage', (arg) => {
        const path = store.getState().activeTab;
        if (path && isLanguageId(arg)) changeDocLanguage(store, path, arg);
        else openPicker('language');
      }),
      registerHandler('editor.changeIndent', (arg) => {
        const path = store.getState().activeTab;
        if (path && isIndent(arg)) changeDocIndent(store, path, arg);
        else openPicker('indent');
      }),
      registerHandler('editor.toggleEol', () => toggleEol()),
    ];
    return () => offs.forEach((off) => off());
  }, [hasDoc, store, openPicker, toggleEol]);

  /* The picker closes when the file goes away. */
  useEffect(() => {
    if (!hasDoc) setPicker(null);
  }, [hasDoc]);

  /* Place the popup above its status item and focus the checked entry. */
  useLayoutEffect(() => {
    if (!picker) return;
    const anchor = anchors.current[picker];
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      const left = Math.max(4, Math.min(r.left, window.innerWidth - 232));
      setMenuStyle({ position: 'fixed', left, bottom: Math.max(0, window.innerHeight - r.top) });
    }
    const menu = menuRef.current;
    const target = menu?.querySelector<HTMLButtonElement>('.menu-item[aria-checked="true"]') ?? menu?.querySelector<HTMLButtonElement>('.menu-item');
    target?.focus();
  }, [picker]);

  /* Outside click closes the popup. */
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchors.current[picker]?.contains(t)) return;
      setPicker(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [picker]);

  const dismissToast = useCallback(() => setToast(null), []);

  const choose = (run: () => void) => {
    run();
    closePicker();
  };

  const indentOptions =
    doc && !INDENT_OPTIONS.some((o) => o.useTabs === doc.indent.useTabs && o.size === doc.indent.size)
      ? [...INDENT_OPTIONS, doc.indent]
      : INDENT_OPTIONS;

  const language: LanguageId = doc?.language ?? 'plaintext';
  const indent: Indent = doc?.indent ?? { useTabs: !state.settings.insertSpaces, size: state.settings.tabSize };
  const eol = doc?.eol ?? 'lf';

  return (
    <>
      <StatusBarFrame>
        <StatusGroup>
          {state.workspace === null && !hasDoc ? <StatusItem testId="status-no-folder">No folder open</StatusItem> : null}
          {hasDoc ? (
            <span className="status-item" data-testid="status-cursor" aria-live="polite">
              {cursorLabel(state.cursor)}
            </span>
          ) : null}
        </StatusGroup>
        <StatusGroup>
          {doc && (doc.readOnly || doc.tooLarge) ? (
            <span className="status-item" data-testid="status-readonly">
              <Icon name="lock" />
              Read-only
            </span>
          ) : null}
          <StatusButton
            title="Change language mode"
            disabled={!hasDoc}
            onPress={() => openPicker('language')}
            testId="status-language"
            buttonRef={(el) => {
              anchors.current.language = el;
            }}
            expanded={picker === 'language'}
          >
            {LANGUAGE_NAMES[language]}
          </StatusButton>
          <StatusButton
            title="Change indentation"
            disabled={!hasDoc}
            onPress={() => openPicker('indent')}
            testId="status-indent"
            buttonRef={(el) => {
              anchors.current.indent = el;
            }}
            expanded={picker === 'indent'}
          >
            {indentLabel(indent)}
          </StatusButton>
          <StatusButton title="Toggle line ending" disabled={!editable} onPress={toggleEol} testId="status-eol">
            {eol === 'crlf' ? 'CRLF' : 'LF'}
          </StatusButton>
          <StatusItem title="Encoding" testId="status-encoding">
            UTF-8
          </StatusItem>
        </StatusGroup>
      </StatusBarFrame>
      {picker && doc ? (
        <Menu
          ref={menuRef}
          label={picker === 'language' ? 'Language mode' : 'Indentation'}
          style={menuStyle}
          testId={`status-${picker}-menu`}
          onClose={closePicker}
        >
          {picker === 'language'
            ? LANGUAGE_IDS.map((id) => (
                <MenuItem
                  key={id}
                  label={LANGUAGE_NAMES[id]}
                  checked={id === doc.language}
                  testId={`language-option-${id}`}
                  onSelect={() => choose(() => changeDocLanguage(store, doc.path, id))}
                />
              ))
            : indentOptions.map((o) => (
                <MenuItem
                  key={indentLabel(o)}
                  label={indentLabel(o)}
                  checked={o.useTabs === doc.indent.useTabs && o.size === doc.indent.size}
                  testId={`indent-option-${o.useTabs ? 'tabs' : 'spaces'}-${o.size}`}
                  onSelect={() => choose(() => changeDocIndent(store, doc.path, o))}
                />
              ))}
        </Menu>
      ) : null}
      {toast ? <Toast onDismiss={dismissToast}>{toast}</Toast> : null}
    </>
  );
}
