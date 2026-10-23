'use strict';
/**
 * File-system IPC: dialogs, directory listing, read/write, create, rename,
 * trash, reveal, stat. Every path goes through security.assertAllowedPath
 * and every argument through validate.cjs; errors leave as short codes.
 *
 * Skeleton: the channels are registered with their final names and reject
 * with 'not-implemented' — filled by "Implement secure main-process file
 * system IPC".
 */

const CHANNELS = [
  'fs:openFolderDialog',
  'fs:openFileDialog',
  'fs:saveAsDialog',
  'fs:readDir',
  'fs:listFiles',
  'fs:readFile',
  'fs:writeFile',
  'fs:createFile',
  'fs:createDir',
  'fs:rename',
  'fs:trash',
  'fs:reveal',
  'fs:stat',
];

/** @param ctx the handler context documented in electron/main.cjs */
function register(ctx) {
  for (const channel of CHANNELS) {
    ctx.handle(channel, async () => {
      throw new Error('not-implemented');
    });
  }
}

module.exports = { CHANNELS, register };
