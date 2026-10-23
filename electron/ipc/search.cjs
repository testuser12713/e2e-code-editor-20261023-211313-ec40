'use strict';
/**
 * Workspace search: runs search-worker.cjs in a worker_thread, limits the
 * result to 5000 matches and the run time to 10 s, and terminates the worker
 * on timeout or cancel (a pathological regex cannot block the main process).
 *
 * Skeleton: the channels are registered with their final names and reject
 * with 'not-implemented' — filled by "Implement workspace search".
 */

const CHANNELS = ['search:run', 'search:cancel'];

const LIMITS = { maxMatches: 5000, timeoutMs: 10000, maxQueryLength: 500 };

/** @param ctx the handler context documented in electron/main.cjs */
function register(ctx) {
  for (const channel of CHANNELS) {
    ctx.handle(channel, async () => {
      throw new Error('not-implemented');
    });
  }
}

module.exports = { CHANNELS, LIMITS, register };
