// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppStoreProvider, createAppStore, createInitialState } from '../state/AppStore';
import { DEFAULT_SETTINGS } from '../core/settings';
import { SettingsView } from './SettingsView';

function renderView() {
  const store = createAppStore(createInitialState());
  render(
    <AppStoreProvider store={store}>
      <SettingsView />
    </AppStoreProvider>,
  );
  return store;
}

afterEach(() => cleanup());

describe('SettingsView', () => {
  it('shows the groups and labels of the settings screen', () => {
    renderView();
    for (const name of ['Appearance', 'Editor', 'Saving']) expect(screen.getByRole('heading', { name })).toBeTruthy();
    for (const label of [
      'Theme',
      'Font family',
      'Font size',
      'Tab size',
      'Insert spaces',
      'Word wrap',
      'Line numbers',
      'Trim trailing whitespace',
      'Final newline',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('shows the current settings', () => {
    renderView();
    expect((screen.getByLabelText('Theme') as HTMLSelectElement).value).toBe('system');
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('13');
    expect((screen.getByLabelText('Insert spaces') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Word wrap') as HTMLInputElement).checked).toBe(false);
  });

  it('edits every settings field', () => {
    const store = renderView();
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    fireEvent.change(screen.getByLabelText('Font family'), { target: { value: 'Consolas' } });
    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Tab size'), { target: { value: '4' } });
    for (const label of ['Insert spaces', 'Word wrap', 'Line numbers', 'Trim trailing whitespace', 'Final newline']) {
      fireEvent.click(screen.getByLabelText(label));
    }
    expect(store.getState().settings).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      fontFamily: 'Consolas',
      fontSize: 18,
      tabSize: 4,
      insertSpaces: false,
      wordWrap: true,
      lineNumbers: false,
      trimOnSave: true,
      finalNewlineOnSave: true,
    });
  });

  it('commits only font sizes in range while typing and clamps on blur', () => {
    const store = renderView();
    const input = screen.getByLabelText('Font size') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1' } });
    expect(store.getState().settings.fontSize).toBe(13);
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    expect(store.getState().settings.fontSize).toBe(32);
    expect(input.value).toBe('32');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('32');
  });

  it('starts neutral: no control shows an error', () => {
    renderView();
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
