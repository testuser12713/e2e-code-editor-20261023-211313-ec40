'use strict';
/**
 * Window geometry: restores the last bounds on start (if they are still on a
 * connected display) and stores them in session.json when the window moves,
 * resizes or closes.
 */
const persistence = require('./ipc/persistence.cjs');

const DEFAULT_BOUNDS = { width: 1280, height: 800 };
const SAVE_DELAY_MS = 500;

/** True when at least 100x50 px of the bounds lie on one of the displays' work areas. */
function isVisibleOnDisplays(bounds, displays) {
  return displays.some((d) => {
    const a = d.workArea || d.bounds;
    if (!a) return false;
    const w = Math.min(bounds.x + bounds.width, a.x + a.width) - Math.max(bounds.x, a.x);
    const h = Math.min(bounds.y + bounds.height, a.y + a.height) - Math.max(bounds.y, a.y);
    return w >= 100 && h >= 50;
  });
}

function getDisplays() {
  try {
    const { screen } = require('electron');
    return screen.getAllDisplays();
  } catch {
    return [];
  }
}

/** The bounds to open the window with: { x?, y?, width, height }. */
function loadBounds(ctx, displays) {
  try {
    const b = persistence.getStore(ctx).loadSession().windowBounds;
    if (b && isVisibleOnDisplays(b, displays || getDisplays())) return { ...b };
  } catch (err) {
    ctx.log.warn('windowState.load', { error: err });
  }
  return { ...DEFAULT_BOUNDS };
}

/** Starts tracking the window's geometry. */
function track(win, ctx) {
  let timer = null;
  const save = () => {
    timer = null;
    try {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
      const bounds = win.isMaximized() && win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
      const store = persistence.getStore(ctx);
      store.saveSession({ ...store.loadSession(), windowBounds: bounds });
    } catch (err) {
      ctx.log.warn('windowState.save', { error: err });
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };
  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('close', () => {
    if (timer) clearTimeout(timer);
    save();
  });
}

module.exports = { DEFAULT_BOUNDS, loadBounds, track, isVisibleOnDisplays };
