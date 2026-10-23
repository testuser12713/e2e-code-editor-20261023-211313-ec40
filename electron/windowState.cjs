'use strict';
/**
 * Window geometry: restores the last bounds on start (if they are still on a
 * connected display) and stores them when the window moves, resizes or
 * closes.
 *
 * Skeleton: final API, inert bodies — filled by "Persist settings, session
 * and window geometry".
 */

const DEFAULT_BOUNDS = { width: 1280, height: 800 };

/** The bounds to open the window with: { x?, y?, width, height }. */
function loadBounds(ctx) {
  void ctx;
  return { ...DEFAULT_BOUNDS };
}

/** Starts tracking the window's geometry. */
function track(win, ctx) {
  void win;
  void ctx;
}

module.exports = { DEFAULT_BOUNDS, loadBounds, track };
