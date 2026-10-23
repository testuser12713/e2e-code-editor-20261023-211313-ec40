'use strict';
/**
 * Worker thread of the workspace search (started by search.cjs). Receives a
 * validated SearchRequest plus the file list, posts back a SearchResponse.
 *
 * Skeleton: answers every request with an empty, flagged response — filled by
 * "Implement workspace search".
 */
const { parentPort } = require('node:worker_threads');

if (parentPort) {
  parentPort.on('message', (msg) => {
    const id = msg && typeof msg.id === 'string' ? msg.id : '';
    parentPort.postMessage({ id, files: [], truncated: false, timedOut: false, error: 'not-implemented' });
  });
}
