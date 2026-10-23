'use strict';
/**
 * Workspace search: runs search-worker.cjs in a worker_thread, limits the
 * result to 5000 matches and the run time to 10 s, and terminates the worker
 * on timeout or cancel (a pathological regex cannot block the main process,
 * AC-24). Arguments are checked by validate.assertSearchRequest (query at
 * most 500 characters) and the root by security.assertAllowedPath.
 *
 * search:run    (req: SearchRequest) => SearchResponse
 *               partial results survive a timeout (timedOut: true) or a
 *               cancel (error: 'cancelled'); an invalid regex answers
 *               error: 'invalid-regex'.
 * search:cancel (id: string) => void — stops the run with that id, if any.
 */
const nodePath = require('node:path');
const { Worker } = require('node:worker_threads');

const CHANNELS = ['search:run', 'search:cancel'];

const LIMITS = { maxMatches: 5000, timeoutMs: 10000, maxQueryLength: 500 };

/** Runs at most this many searches at once; a newer one stops the oldest. */
const MAX_CONCURRENT = 4;

const WORKER_FILE = nodePath.join(__dirname, 'search-worker.cjs');

function defaultSpawn(request) {
  return new Worker(WORKER_FILE, { workerData: { kind: 'workspace-search', request } });
}

function sortKey(p) {
  return p.toLowerCase();
}

/**
 * The search service, independent of IPC so it can be tested directly.
 * @param deps { validate, security, spawn?, timeoutMs?, maxMatches? }
 */
function createSearchService({ validate, security, spawn = defaultSpawn, timeoutMs = LIMITS.timeoutMs, maxMatches = LIMITS.maxMatches }) {
  /** id → { stop(reason) } of every running search */
  const active = new Map();

  function cancel(id) {
    validate.assertString(id, { max: 100 });
    const run = active.get(id);
    if (run) run.stop('cancelled');
  }

  async function run(req) {
    validate.assertSearchRequest(req);
    const root = security.assertAllowedPath(req.root);
    const response = { id: req.id, files: [], truncated: false, timedOut: false };
    if (req.query.length === 0) return response;

    if (active.has(req.id)) active.get(req.id).stop('cancelled');
    while (active.size >= MAX_CONCURRENT) active.values().next().value.stop('cancelled');

    const request = {
      id: req.id,
      root,
      query: req.query,
      caseSensitive: req.caseSensitive,
      wholeWord: req.wholeWord,
      regex: req.regex,
      include: req.include,
      exclude: req.exclude,
      maxMatches,
    };

    return new Promise((resolve) => {
      let total = 0;
      let finished = false;
      let worker = null;
      let timer = null;

      const entry = {
        stop(reason) {
          if (reason === 'timeout') finish({ timedOut: true });
          else finish({ error: reason });
        },
      };

      function finish(extra) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        if (active.get(req.id) === entry) active.delete(req.id);
        if (worker) {
          worker.removeAllListeners('message');
          worker.terminate().catch(() => undefined);
        }
        response.files.sort((a, b) => {
          const x = sortKey(a.path);
          const y = sortKey(b.path);
          return x < y ? -1 : x > y ? 1 : 0;
        });
        resolve(Object.assign(response, extra || {}));
      }

      active.set(req.id, entry);
      try {
        worker = spawn(request);
      } catch {
        finish({ error: 'search-failed' });
        return;
      }
      timer = setTimeout(() => entry.stop('timeout'), timeoutMs);

      worker.on('message', (msg) => {
        if (finished || !msg || typeof msg !== 'object') return;
        if (msg.type === 'file' && msg.file && Array.isArray(msg.file.matches)) {
          const room = maxMatches - total;
          if (room <= 0) return;
          const matches = msg.file.matches.slice(0, room);
          total += matches.length;
          response.files.push({ path: String(msg.file.path), matches });
          if (total >= maxMatches) finish({ truncated: true });
        } else if (msg.type === 'done') {
          finish({ truncated: Boolean(msg.truncated) });
        } else if (msg.type === 'error') {
          const code = typeof msg.error === 'string' && /^[a-z][a-z0-9-]{0,40}$/.test(msg.error) ? msg.error : 'search-failed';
          finish({ error: code });
        }
      });
      worker.on('error', () => finish({ error: 'search-failed' }));
      worker.on('exit', () => finish());
    });
  }

  /** Stops every running search (window closed, tests). */
  function dispose() {
    for (const r of [...active.values()]) r.stop('cancelled');
  }

  return { run, cancel, dispose, active };
}

let service = null;

/** @param ctx the handler context documented in electron/main.cjs */
function register(ctx) {
  service = createSearchService({ validate: ctx.validate, security: ctx.security });
  ctx.handle('search:run', (req) => service.run(req));
  ctx.handle('search:cancel', async (id) => {
    service.cancel(id);
  });
}

function dispose() {
  if (service) service.dispose();
}

module.exports = { CHANNELS, LIMITS, register, dispose, createSearchService, WORKER_FILE };
