'use strict';
/**
 * Disk watching of the open workspace: emits fs:onChange events
 * ({ type: 'add'|'change'|'unlink'|'addDir'|'unlinkDir', path }) to the
 * window via ctx.send, ignoring node_modules and .git.
 *
 * Skeleton: the channels are registered with their final names and reject
 * with 'not-implemented' — filled by "Add explorer file operations and disk
 * watching".
 */

const CHANNELS = ['fs:watch', 'fs:unwatch'];

/** Event channel main → renderer. */
const CHANGE_EVENT = 'fs:onChange';

/** @param ctx the handler context documented in electron/main.cjs */
function register(ctx) {
  for (const channel of CHANNELS) {
    ctx.handle(channel, async () => {
      throw new Error('not-implemented');
    });
  }
}

/** Stops every watcher (called when the window closes). */
function dispose() {
  // nothing is watched in the skeleton
}

module.exports = { CHANNELS, CHANGE_EVENT, register, dispose };
