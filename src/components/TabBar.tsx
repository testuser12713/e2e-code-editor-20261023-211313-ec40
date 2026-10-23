/**
 * Tab bar: preview tabs in italics, dirty dot, close button / middle click,
 * drag and drop reordering, and the tab.close / tab.next / tab.prev commands
 * (design/mockups/editor.html).
 */
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useApp, useAppStore } from '../state/AppStore';
import { registerHandler, runCommand } from '../commands/registry';
import { cycleTab } from '../core/tabs';
import { getActiveView } from '../editor/keymaps';
import { TabItem } from '../ui/Tab';
// One definition of "dirty" for the tab dot, the save prompt and Save All.
import { isDirty } from './SavePrompt';

const DRAG_TYPE = 'application/x-code-editor-tab';

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i >= 0 ? path.slice(i + 1) : path;
}

function focusEditorSoon(): void {
  const focus = () => getActiveView()?.focus();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focus);
  else setTimeout(focus, 0);
}

export function TabBar() {
  const { state, dispatch } = useApp();
  const store = useAppStore();
  const barRef = useRef<HTMLDivElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  // tab.close (arg: a path, default the active tab), tab.next, tab.prev.
  useEffect(() => {
    const cycle = (step: 1 | -1) => () => {
      const s = store.getState();
      const next = cycleTab(s.tabs, s.activeTab, step);
      if (next && next !== s.activeTab) {
        store.dispatch({ type: 'tab/activate', path: next });
        focusEditorSoon();
      }
    };
    const offs = [
      registerHandler('tab.close', (arg) => {
        const path = typeof arg === 'string' ? arg : store.getState().activeTab;
        if (path) store.dispatch({ type: 'tab/close', path });
      }),
      registerHandler('tab.next', cycle(1)),
      registerHandler('tab.prev', cycle(-1)),
    ];
    return () => offs.forEach((off) => off());
  }, [store]);

  // Keep the active tab visible in a crowded strip.
  useEffect(() => {
    const el = barRef.current?.querySelector<HTMLElement>('.tab.is-active');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [state.activeTab]);

  const endDrag = () => {
    setDragFrom(null);
    setDropAt(null);
  };

  const onDrop = (index: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer?.getData(DRAG_TYPE);
    const from = raw ? Number(raw) : dragFrom;
    if (from !== null && Number.isInteger(from) && from !== index) dispatch({ type: 'tab/reorder', from, to: index });
    endDrag();
  };

  return (
    <div className="tabbar" role="tablist" aria-label="Open files" data-testid="tab-bar" ref={barRef}>
      {state.tabs.map((tab, index) => {
        const doc = state.docs[tab.path];
        const name = baseName(tab.path);
        return (
          <TabItem
            key={tab.path}
            name={name}
            title={tab.path}
            active={tab.path === state.activeTab}
            preview={tab.preview}
            dirty={isDirty(doc)}
            readOnly={doc?.readOnly ?? false}
            dragging={dragFrom === index}
            dropTarget={dropAt === index && dragFrom !== null && dragFrom !== index}
            testId={`tab-${name}`}
            draggable
            onSelect={() => {
              dispatch({ type: 'tab/activate', path: tab.path });
              focusEditorSoon();
            }}
            onPin={() => dispatch({ type: 'tab/pin', path: tab.path })}
            onClose={() => runCommand('tab.close', tab.path)}
            onDragStart={(e) => {
              setDragFrom(index);
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(DRAG_TYPE, String(index));
              }
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              if (dropAt !== index) setDropAt(index);
            }}
            onDragLeave={() => {
              if (dropAt === index) setDropAt(null);
            }}
            onDrop={onDrop(index)}
            onDragEnd={endDrag}
          />
        );
      })}
    </div>
  );
}
