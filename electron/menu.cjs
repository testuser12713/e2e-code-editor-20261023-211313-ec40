'use strict';
/**
 * Native application menu (File, Edit, View, Help). Every item sends its
 * command id to the renderer over the app:onMenuCommand event, so the menu
 * triggers exactly the same commands as the shortcuts. app:setMenuState keeps
 * the Word Wrap and theme check marks in sync.
 *
 * Skeleton: final API; app:setMenuState rejects with 'not-implemented' and no
 * custom menu is installed yet (Electron's default menu stays) — filled by
 * "Add native menu, About dialog and zoom shortcuts".
 */

const CHANNELS = ['app:setMenuState'];

/** Event channel main → renderer carrying a command id. */
const MENU_COMMAND_EVENT = 'app:onMenuCommand';

/** @param ctx the handler context documented in electron/main.cjs */
function register(ctx) {
  for (const channel of CHANNELS) {
    ctx.handle(channel, async () => {
      throw new Error('not-implemented');
    });
  }
}

/** Builds and installs the native menu. */
function install(ctx) {
  void ctx;
}

module.exports = { CHANNELS, MENU_COMMAND_EVENT, register, install };
