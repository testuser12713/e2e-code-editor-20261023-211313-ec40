// @vitest-environment node
/**
 * The native menu template: every item is a command of COMMANDS, shows that
 * command's shortcut, sends its id, and the check marks follow app:setMenuState.
 * Electron is never loaded; the menu module only receives a fake context.
 */
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { COMMANDS } from '../src/commands/registry';

const req = createRequire(import.meta.url);
const menu = req('./menu.cjs');
const validate = req('./validate.cjs');

type Item = {
  id?: string;
  label?: string;
  role?: string;
  type?: string;
  accelerator?: string;
  registerAccelerator?: boolean;
  checked?: boolean;
  click?: (menuItem?: { checked: boolean }) => void;
};
type Top = { label: string; submenu: Item[] };

const commandItems = (template: Top[]) => template.flatMap((m) => m.submenu.filter((i) => i.id));

describe('native menu template (AC-16)', () => {
  it('has File, Edit, View and Help', () => {
    const template: Top[] = menu.buildTemplate(() => undefined);
    expect(template.map((m) => m.label.replace('&', ''))).toEqual(['File', 'Edit', 'View', 'Help']);
  });

  it('uses only command ids of COMMANDS, each once, and covers every command', () => {
    const known = new Set(COMMANDS.map((c) => c.id));
    const ids: string[] = menu.menuCommandIds();
    for (const id of ids) expect(known.has(id), id).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...known].sort());
  });

  it('shows the same shortcut as COMMANDS without registering it twice', () => {
    for (const c of COMMANDS) expect(menu.SHORTCUTS[c.id], c.id).toBe(c.shortcut);
    const template: Top[] = menu.buildTemplate(() => undefined);
    for (const item of commandItems(template)) {
      const shortcut = COMMANDS.find((c) => c.id === item.id)!.shortcut;
      const expected = menu.toAccelerator(shortcut);
      expect(item.accelerator ?? null, item.id).toBe(expected);
      if (item.accelerator) expect(item.registerAccelerator).toBe(false);
    }
  });

  it('converts shortcuts to Electron accelerators', () => {
    expect(menu.toAccelerator('Ctrl+Shift+P')).toBe('Ctrl+Shift+P');
    expect(menu.toAccelerator('Ctrl+Plus')).toBe('Ctrl+Plus');
    expect(menu.toAccelerator('Ctrl+Minus')).toBe('Ctrl+-');
    expect(menu.toAccelerator('Ctrl+K Ctrl+O')).toBeNull();
    expect(menu.toAccelerator(undefined)).toBeNull();
  });

  it('sends the item command id when chosen', () => {
    const send = vi.fn();
    const template: Top[] = menu.buildTemplate(send);
    const about = commandItems(template).find((i) => i.id === 'help.about')!;
    about.click!();
    expect(send).toHaveBeenCalledWith('help.about');
    const zoom = commandItems(template).find((i) => i.id === 'view.zoomIn')!;
    zoom.click!();
    expect(send).toHaveBeenLastCalledWith('view.zoomIn');
  });

  it('word wrap and dark theme are check marks reflecting the menu state', () => {
    const template: Top[] = menu.buildTemplate(() => undefined, { wordWrap: true, theme: 'dark' });
    const items = commandItems(template);
    const wrap = items.find((i) => i.id === 'view.toggleWordWrap')!;
    const theme = items.find((i) => i.id === 'view.toggleTheme')!;
    expect(wrap.type).toBe('checkbox');
    expect(wrap.checked).toBe(true);
    expect(theme.type).toBe('checkbox');
    expect(theme.checked).toBe(true);
    const light: Top[] = menu.buildTemplate(() => undefined, { wordWrap: false, theme: 'light' });
    expect(commandItems(light).find((i) => i.id === 'view.toggleTheme')!.checked).toBe(false);
  });

  it('installs the menu and app:setMenuState updates the check marks', async () => {
    const items = new Map<string, { checked: boolean }>();
    const Menu = {
      buildFromTemplate: vi.fn((template: Top[]) => {
        for (const item of commandItems(template)) if (item.type === 'checkbox') items.set(item.id!, { checked: !!item.checked });
        return { getMenuItemById: (id: string) => items.get(id) ?? null };
      }),
      setApplicationMenu: vi.fn(),
    };
    const handlers: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
    const send = vi.fn();
    const ctx = {
      handle: (c: string, fn: (...a: unknown[]) => Promise<unknown>) => (handlers[c] = fn),
      send,
      electron: { Menu, app: { isPackaged: true } },
      validate,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
    menu.register(ctx);
    menu.install(ctx);
    expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(1);
    expect(Object.keys(handlers)).toEqual(menu.CHANNELS);

    await handlers['app:setMenuState']({ wordWrap: true, theme: 'dark' });
    expect(items.get('view.toggleWordWrap')!.checked).toBe(true);
    expect(items.get('view.toggleTheme')!.checked).toBe(true);
    await expect(handlers['app:setMenuState']({ wordWrap: 'yes', theme: 'dark' })).rejects.toThrow();

    // Clicking a check mark sends the command but keeps the mark until the renderer reports back.
    const template: Top[] = Menu.buildFromTemplate.mock.calls[0][0];
    const wrap = commandItems(template).find((i) => i.id === 'view.toggleWordWrap')!;
    const menuItem = { checked: false };
    wrap.click!(menuItem);
    expect(menuItem.checked).toBe(true);
    expect(send).toHaveBeenCalledWith(menu.MENU_COMMAND_EVENT, 'view.toggleWordWrap');
  });

  it('a failing menu build is logged and does not throw', () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const ctx = {
      send: vi.fn(),
      electron: { Menu: { buildFromTemplate: () => { throw new Error('boom'); }, setApplicationMenu: vi.fn() }, app: {} },
      log,
    };
    expect(() => menu.install(ctx)).not.toThrow();
    expect(log.error).toHaveBeenCalledWith('menu.install', expect.anything());
  });
});
