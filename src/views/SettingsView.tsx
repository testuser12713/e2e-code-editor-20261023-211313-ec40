/**
 * Settings sidebar (design/mockups/settings.html `sidebar-settings`):
 * Appearance (theme, font family, font size), Editor (tab size, insert
 * spaces, word wrap, line numbers) and Saving (trim trailing whitespace,
 * final newline). Every change goes to the app store at once: open editors
 * reconfigure live (src/editor/settingsExtensions.ts) and the session sync
 * stores the settings through settings.save.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useApp, useAppStore, type AppStoreHandle } from '../state/AppStore';
import type { Settings, ThemeSetting } from '../types';
import { FONT_FAMILIES, MAX_FONT_SIZE, MIN_FONT_SIZE, TAB_SIZES, clampFontSize, withSetting } from '../core/settings';
import { installSettingsRuntime } from '../editor/settingsExtensions';
import { Select, SettingRow, SettingsGroup, SidebarBody, SidebarHeader, Switch, TextInput, type SelectOption } from '../ui';

// The settings commands (toggle theme, word wrap, zoom, open settings) and the
// document mirror of the editor settings are app-wide, not tied to this view
// being shown; this module is loaded with the app shell.
installSettingsRuntime();

const THEME_OPTIONS: SelectOption[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const FONT_OPTIONS: SelectOption[] = FONT_FAMILIES.map((f) => ({ value: f, label: f }));

const TAB_OPTIONS: SelectOption[] = TAB_SIZES.map((n) => ({ value: String(n), label: String(n) }));

/** Font size field: commits every whole number in range while typing, clamps on blur. */
function FontSizeInput({ value, onCommit }: { value: number; onCommit: (size: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <TextInput
      id="set-size"
      type="number"
      mono
      min={MIN_FONT_SIZE}
      max={MAX_FONT_SIZE}
      step={1}
      data-setting="fontSize"
      data-testid="setting-fontSize"
      value={draft}
      onChange={(e) => {
        const text = e.currentTarget.value;
        setDraft(text);
        const n = Number(text);
        if (text.trim() !== '' && Number.isInteger(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE) onCommit(n);
      }}
      onBlur={() => {
        const n = Number(draft);
        const next = draft.trim() === '' || !Number.isFinite(n) ? value : clampFontSize(n);
        setDraft(String(next));
        if (next !== value) onCommit(next);
      }}
    />
  );
}

/**
 * Controls whose value the form commits straight from the DOM. The font size
 * field is left out on purpose: it keeps a draft while typing and clamps on blur.
 */
const DOM_BOUND_SETTINGS = new Set<string>([
  'theme',
  'fontFamily',
  'tabSize',
  'insertSpaces',
  'wordWrap',
  'lineNumbers',
  'trimOnSave',
  'finalNewlineOnSave',
]);

/** Commits one control's current DOM value to the store; a no-op when nothing changes. */
function commitControl(store: AppStoreHandle, target: EventTarget | null): void {
  if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return;
  const key = target.dataset.setting;
  if (!key || !DOM_BOUND_SETTINGS.has(key)) return;
  const raw = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
  const current = store.getState().settings;
  const next = withSetting(current, key, raw);
  if (next !== current) store.dispatch({ type: 'settings/set', settings: next });
}

/**
 * Binds the form's controls to the store with NATIVE listeners. React's
 * onChange only sees a `change` event that bubbles up to the React root, so
 * a select whose value changes through an `input` event, or through a
 * `change` event that does not bubble, used to show "Dark" while the app
 * stayed light. A capture listener on the form sees every input/change of a
 * control inside it, bubbling or not, and commits the value the control
 * shows — the select and the applied theme can no longer disagree.
 */
function useNativeSettingsBinding(form: RefObject<HTMLFormElement | null>, store: AppStoreHandle): void {
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const onEvent = (e: Event) => commitControl(store, e.target);
    el.addEventListener('input', onEvent, true);
    el.addEventListener('change', onEvent, true);
    return () => {
      el.removeEventListener('input', onEvent, true);
      el.removeEventListener('change', onEvent, true);
    };
  }, [form, store]);
}

export function SettingsView() {
  const { state } = useApp();
  const store = useAppStore();
  const formRef = useRef<HTMLFormElement>(null);
  useNativeSettingsBinding(formRef, store);
  const s = state.settings;
  /** Always builds on the store's current settings, so two quick changes never undo each other. */
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const current = store.getState().settings;
    if (current[key] === value) return;
    store.dispatch({ type: 'settings/set', settings: { ...current, [key]: value } });
  };

  return (
    <>
      <SidebarHeader title="Settings" />
      <SidebarBody>
        <form ref={formRef} className="settings-form" data-testid="settings-form" onSubmit={(e) => e.preventDefault()}>
          <SettingsGroup id="set-appearance" title="Appearance">
            <SettingRow label="Theme" htmlFor="set-theme" description="System follows the Windows color scheme.">
              <Select
                id="set-theme"
                data-setting="theme"
                data-testid="setting-theme"
                options={THEME_OPTIONS}
                value={s.theme}
                onValueChange={(v) => set('theme', v as ThemeSetting)}
              />
            </SettingRow>
            <SettingRow label="Font family" htmlFor="set-font">
              <Select
                id="set-font"
                data-setting="fontFamily"
                data-testid="setting-fontFamily"
                options={FONT_OPTIONS}
                value={s.fontFamily}
                onValueChange={(v) => set('fontFamily', v)}
              />
            </SettingRow>
            <SettingRow label="Font size" htmlFor="set-size" description="In pixels, 8 to 32.">
              <FontSizeInput value={s.fontSize} onCommit={(n) => set('fontSize', n)} />
            </SettingRow>
          </SettingsGroup>
          <SettingsGroup id="set-editor" title="Editor">
            <SettingRow label="Tab size" htmlFor="set-tab">
              <Select
                id="set-tab"
                data-setting="tabSize"
                data-testid="setting-tabSize"
                options={TAB_OPTIONS}
                value={String(s.tabSize)}
                onValueChange={(v) => set('tabSize', Number(v))}
              />
            </SettingRow>
            <SettingRow label="Insert spaces" htmlFor="set-spaces" description="Use spaces instead of tab characters.">
              <Switch
                id="set-spaces"
                data-setting="insertSpaces"
                data-testid="setting-insertSpaces"
                checked={s.insertSpaces}
                onCheckedChange={(v) => set('insertSpaces', v)}
              />
            </SettingRow>
            <SettingRow label="Word wrap" htmlFor="set-wrap">
              <Switch
                id="set-wrap"
                data-setting="wordWrap"
                data-testid="setting-wordWrap"
                checked={s.wordWrap}
                onCheckedChange={(v) => set('wordWrap', v)}
              />
            </SettingRow>
            <SettingRow label="Line numbers" htmlFor="set-lines">
              <Switch
                id="set-lines"
                data-setting="lineNumbers"
                data-testid="setting-lineNumbers"
                checked={s.lineNumbers}
                onCheckedChange={(v) => set('lineNumbers', v)}
              />
            </SettingRow>
          </SettingsGroup>
          <SettingsGroup id="set-saving" title="Saving">
            <SettingRow
              label="Trim trailing whitespace"
              htmlFor="set-trim"
              description="Removes spaces at the end of lines when you save."
            >
              <Switch
                id="set-trim"
                data-setting="trimOnSave"
                data-testid="setting-trimOnSave"
                checked={s.trimOnSave}
                onCheckedChange={(v) => set('trimOnSave', v)}
              />
            </SettingRow>
            <SettingRow
              label="Final newline"
              htmlFor="set-newline"
              description="Adds a newline at the end of the file when you save."
            >
              <Switch
                id="set-newline"
                data-setting="finalNewlineOnSave"
                data-testid="setting-finalNewlineOnSave"
                checked={s.finalNewlineOnSave}
                onCheckedChange={(v) => set('finalNewlineOnSave', v)}
              />
            </SettingRow>
          </SettingsGroup>
        </form>
        <p className="settings-note">
          Changes apply to all open editors immediately and are stored as JSON in the app&apos;s user data folder.
        </p>
      </SidebarBody>
    </>
  );
}
