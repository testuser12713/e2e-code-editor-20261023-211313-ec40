/**
 * Command palette (Ctrl+Shift+P): fuzzy-filters COMMANDS, shows shortcuts,
 * runs on Enter. Shown while state.overlay === 'palette'
 * (design/mockups/command-palette.html).
 *
 * Commands without a registered handler are listed but disabled: they can be
 * navigated to, but neither Enter nor a click runs them.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useApp, useAppStore } from '../state/AppStore';
import { COMMANDS, hasHandler, onHandlersChanged, registerHandler, runCommand, type Command } from '../commands/registry';
import { fuzzyMatch, rankFuzzy } from '../core/fuzzy';
import { getActiveView } from '../editor/keymaps';
import { Scrim } from '../ui/Dialog';
import { Keys } from '../ui/Button';
import { cn } from '../ui/cn';
import { HighlightedText, ListRow, OverlayEmpty, OverlayFooter, OverlayInput, OverlayList, OverlayListBox } from '../ui/OverlayList';

const LIST_ID = 'command-palette-list';

/** Matches a command's title against the query. */
function commandText(c: Command): string {
  return c.title;
}

/**
 * The commands matching `query`, best match first. Uses rankFuzzy; should it
 * ever hand back the list unfiltered for a non-empty query, a plain
 * case-insensitive substring filter is applied instead.
 */
export function filterCommands(query: string, commands: Command[] = COMMANDS): Command[] {
  const q = query.trim();
  const ranked = rankFuzzy(q, commands, commandText);
  if (q === '' || ranked.length < commands.length) return ranked;
  const lower = q.toLowerCase();
  const substring = commands.filter((c) => c.title.toLowerCase().includes(lower));
  // Every command genuinely matched as a subsequence: keep the ranked order.
  return ranked.every((c) => fuzzyMatch(q, c.title)) ? ranked : substring;
}

/**
 * The row selected after a navigation key, or null when `key` does not
 * navigate. Up/Down wrap around; PageUp/PageDown move ten rows and stop at the ends.
 */
export function nextSelection(key: string, sel: number, count: number): number | null {
  const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
  const step = steps[key];
  if (step === undefined) return null;
  if (count === 0) return sel;
  if (Math.abs(step) === 1) return (sel + step + count) % count;
  return Math.min(count - 1, Math.max(0, sel + step));
}

/** Re-renders whenever a command handler is (un)registered. */
let handlersVersion = 0;
onHandlersChanged(() => {
  handlersVersion++;
});
function useHandlersVersion(): number {
  return useSyncExternalStore(onHandlersChanged, () => handlersVersion, () => handlersVersion);
}

/** Inline style of a disabled row (the kit's ListRow has no disabled state; same values as `.menu-item[aria-disabled]`). */
const DISABLED_ROW_STYLE = { opacity: 0.45, cursor: 'not-allowed' } as const;

export function CommandPalette() {
  const { state, dispatch } = useApp();
  const store = useAppStore();
  const open = state.overlay === 'palette';
  useHandlersVersion();

  useEffect(
    () =>
      registerHandler('view.palette', () => {
        store.dispatch({ type: 'overlay/set', overlay: 'palette' });
      }),
    [store],
  );

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setSelected(0);
    inputRef.current?.focus();
  }, [open]);

  const rows = useMemo(() => (open ? filterCommands(query) : []), [open, query]);
  const sel = rows.length ? Math.min(selected, rows.length - 1) : -1;

  useEffect(() => {
    if (!open || sel < 0) return;
    const el = document.getElementById(`${LIST_ID}-${sel}`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [open, sel]);

  if (!open) return null;

  const close = () => {
    dispatch({ type: 'overlay/set', overlay: null });
    const target = returnFocus.current;
    if (target && target.isConnected && target !== document.body) target.focus();
    else getActiveView()?.focus();
  };

  const pick = (index: number) => {
    const cmd = rows[index];
    if (!cmd || !hasHandler(cmd.id)) return;
    // Close first: the command may open another overlay or act on the editor.
    close();
    runCommand(cmd.id);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(sel);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else {
      const next = nextSelection(e.key, sel, rows.length);
      if (next === null) return;
      e.preventDefault();
      setSelected(next);
    }
  };

  const q = query.trim();

  return (
    <>
      <Scrim onPress={close} />
      <OverlayList label="Command Palette" testId="command-palette">
        <OverlayInput
          ref={inputRef}
          label="Type a command"
          placeholder="Type a command"
          listId={LIST_ID}
          activeOptionId={sel >= 0 ? `${LIST_ID}-${sel}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          data-testid="command-palette-input"
        />
        <OverlayListBox id={LIST_ID} label="Commands">
          {rows.map((cmd, i) => {
            const indices = q ? (fuzzyMatch(q, cmd.title)?.indices ?? []) : [];
            const title = <HighlightedText text={cmd.title} indices={indices} />;
            const hover = () => {
              if (i !== sel) setSelected(i);
            };
            if (hasHandler(cmd.id)) {
              return (
                <ListRow
                  key={cmd.id}
                  id={`${LIST_ID}-${i}`}
                  title={title}
                  shortcut={cmd.shortcut}
                  selected={i === sel}
                  onSelect={() => pick(i)}
                  onHover={hover}
                  testId="command-palette-row"
                />
              );
            }
            return (
              <div
                key={cmd.id}
                id={`${LIST_ID}-${i}`}
                className={cn('qp-row', i === sel && 'is-selected')}
                role="option"
                aria-selected={i === sel}
                aria-disabled="true"
                title="Not available right now"
                style={DISABLED_ROW_STYLE}
                data-testid="command-palette-row"
                onMouseMove={hover}
              >
                <span className="qp-title">{title}</span>
                {cmd.shortcut ? <Keys shortcut={cmd.shortcut} /> : null}
              </div>
            );
          })}
          {rows.length === 0 && <OverlayEmpty>No matching commands</OverlayEmpty>}
        </OverlayListBox>
        <OverlayFooter
          hints={[
            { keys: 'Up Down', label: 'navigate' },
            { keys: 'Enter', label: 'run' },
            { keys: 'Esc', label: 'close' },
          ]}
        />
      </OverlayList>
    </>
  );
}
