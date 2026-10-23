'use strict';
/**
 * Settings and session as JSON files in the userData directory
 * (settings.json, session.json). A missing or corrupt file yields the
 * defaults; only settings, workspace paths, tab paths and window geometry are
 * stored — never file contents or unsaved buffers.
 *
 * Skeleton: the channels are registered with their final names and reject
 * with 'not-implemented' — filled by "Persist settings, session and window
 * geometry".
 */

const CHANNELS = ['settings:load', 'settings:save', 'session:load', 'session:save', 'session:clearRecent'];

/** @param ctx the handler context documented in electron/main.cjs */
function register(ctx) {
  for (const channel of CHANNELS) {
    ctx.handle(channel, async () => {
      throw new Error('not-implemented');
    });
  }
}

module.exports = { CHANNELS, register };
