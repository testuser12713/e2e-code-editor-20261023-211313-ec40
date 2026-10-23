import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Gallery from './gallery';
import { cn } from './cn';

afterEach(() => cleanup());

const SECTIONS = [
  'buttons',
  'icon-and-activity-buttons',
  'toggle-buttons',
  'inputs-input-group-labels-and-errors',
  'settings-group-and-setting-row',
  'modal-dialog-with-action-row',
  'popup-and-context-menu',
  'overlay-list-and-list-rows',
  'banner-and-toast',
  'tab-item-states',
  'sidebar-tree-and-tree-rows',
  'shell-chrome-and-resizer',
];

describe('UI kit gallery', () => {
  it('renders every component section in the light and the dark theme', () => {
    render(<Gallery />);
    for (const theme of ['light', 'dark'] as const) {
      const panel = screen.getByTestId(`gallery-${theme}`);
      expect(panel.className).toContain(`theme-${theme}`);
      for (const id of SECTIONS) expect(within(panel).getByTestId(`gallery-section-${id}`)).toBeTruthy();
    }
  });

  it('shows the idle, hover, focus, active, selected, disabled and error states', () => {
    render(<Gallery />);
    const panel = screen.getByTestId('gallery-light');
    const q = (sel: string) => panel.querySelectorAll(sel).length;
    // pinned pointer / keyboard states
    expect(q('.btn.is-hover')).toBeGreaterThan(0);
    expect(q('.btn.is-focus')).toBeGreaterThan(0);
    expect(q('.btn.is-pressed')).toBeGreaterThan(0);
    expect(q('.btn-primary')).toBeGreaterThan(0);
    expect(q('button.btn:disabled')).toBe(4);
    expect(q('.icon-btn:disabled')).toBe(1);
    // selected / current / pressed
    expect(q('.activity-btn[aria-current="page"]')).toBeGreaterThan(0);
    expect(q('.toggle[aria-pressed="true"]')).toBeGreaterThan(0);
    expect(q('.qp-row.is-selected[aria-selected="true"]')).toBe(1);
    expect(q('.tab.is-active')).toBe(1);
    expect(q('.tab.is-dirty')).toBe(1);
    expect(q('.tab.is-preview')).toBe(1);
    expect(q('.tree-row.is-active')).toBe(1);
    expect(q('.tree-row.is-menu-target')).toBe(1);
    // error states
    expect(q('.input-group.is-invalid')).toBe(1);
    expect(q('.field-error')).toBeGreaterThan(0);
    expect(q('.qp-hint.is-invalid')).toBe(1);
    // overlays and chrome
    expect(within(panel).getByRole('alertdialog', { name: 'Save changes to args.ts?' })).toBeTruthy();
    expect(within(panel).getByRole('menu', { name: 'Explorer actions' })).toBeTruthy();
    expect(within(panel).getByRole('menuitem', { name: /Reveal in File Explorer/ }).hasAttribute('disabled')).toBe(true);
    expect(within(panel).getAllByRole('alert').length).toBeGreaterThan(1);
    expect(within(panel).getByRole('status')).toBeTruthy();
    expect(within(panel).getByTestId('gallery-title-bar')).toBeTruthy();
    expect(within(panel).getByTestId('gallery-activity-bar')).toBeTruthy();
    expect(within(panel).getByTestId('gallery-status-bar')).toBeTruthy();
    expect(within(panel).getByRole('separator', { name: 'Resize gallery pane' })).toBeTruthy();
    expect(within(panel).getByRole('tree')).toBeTruthy();
    expect(q('.empty-state')).toBe(1);
    expect(q('.setting-row')).toBe(3);
  });

  it('its controls work: toggles flip, rows select, the resizer moves, buttons report', () => {
    render(<Gallery />);
    const panel = screen.getByTestId('gallery-dark');
    const toggle = within(panel).getByRole('button', { name: 'Regular expression' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    const rows = Array.from(panel.querySelectorAll<HTMLElement>('.qp-row'));
    fireEvent.click(rows[1]);
    expect(rows[1].getAttribute('aria-selected')).toBe('true');
    expect(rows[0].getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('gallery-last-action').textContent).toContain('open forecast.ts');

    const resizer = within(panel).getByRole('separator', { name: 'Resize gallery pane' });
    fireEvent.keyDown(resizer, { key: 'ArrowRight' });
    expect(resizer.getAttribute('aria-valuenow')).toBe('136');

    const folder = within(panel).getByRole('button', { name: 'src' });
    expect(folder.closest('[role="treeitem"]')?.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(folder);
    expect(folder.closest('[role="treeitem"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a field error only after the field was touched', () => {
    render(<Gallery />);
    const panel = screen.getByTestId('gallery-light');
    const input = within(panel).getByLabelText('Files to include') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(within(panel).queryByText('Enter a pattern.')).toBeNull();
    fireEvent.blur(input);
    expect(within(panel).getByText('Enter a pattern.')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('cn', () => {
  it('joins truthy class names and skips falsy ones', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });
});
