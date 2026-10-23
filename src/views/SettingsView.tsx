/**
 * Settings sidebar (design/mockups/settings.html `sidebar-settings`):
 * Appearance (theme, font family, font size), Editor (tab size, insert
 * spaces, word wrap, line numbers) and Saving (trim trailing whitespace,
 * final newline). Every change goes to the app store at once: open editors
 * reconfigure live (src/editor/settingsExtensions.ts) and the session sync
 * stores the settings through settings.save.
 */
import { useEffect, useState } from 'react';
import { useApp } from '../state/AppStore';
import type { Settings, ThemeSetting } from '../types';
import { FONT_FAMILIES, MAX_FONT_SIZE, MIN_FONT_SIZE, TAB_SIZES, clampFontSize } from '../core/settings';
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

export function SettingsView() {
  const { state, dispatch } = useApp();
  const s = state.settings;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    dispatch({ type: 'settings/set', settings: { ...s, [key]: value } });
  };

  return (
    <>
      <SidebarHeader title="Settings" />
      <SidebarBody>
        <form className="settings-form" data-testid="settings-form" onSubmit={(e) => e.preventDefault()}>
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
