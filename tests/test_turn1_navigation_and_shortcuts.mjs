import assert from 'node:assert/strict';
import { computePinchNavigation, computeWheelNavigation } from '../src/hooks/useCanvasNavigation.ts';
import {
  KEYBINDS_STORAGE_KEY,
  SHORTCUT_DEFINITIONS,
  eventToShortcutCombo,
  findShortcutConflict,
  formatComboLabel,
  getShortcutCombo,
  matchesCombo,
  matchesShortcutAction,
  normalizeCombo,
  resetAllShortcuts,
  resetShortcutCombo,
  setShortcutCombo,
} from '../src/utils/shortcuts.ts';

// Minimal localStorage polyfill for Node test environment
const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => {
    memStore.set(k, String(v));
  },
  removeItem: (k) => {
    memStore.delete(k);
  },
};

console.log('--- Wheel & Trackpad navigation math ---');

// 1. Mouse mode: vertical scroll zooms around cursor
{
  const res = computeWheelNavigation({
    deltaX: 0,
    deltaY: -100,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    inputMode: 'mouse',
    zoom: 1.0,
    pan: { x: 0, y: 0 },
    cursorLocal: { x: 200, y: 100 },
    minZoom: 0.25,
    maxZoom: 2.5,
  });
  assert.equal(res.zoom, 1.12);
  assert.ok(Math.abs(res.pan.x - (200 - 200 * 1.12)) < 1e-6);
  assert.ok(Math.abs(res.pan.y - (100 - 100 * 1.12)) < 1e-6);
}

// 2. Mouse mode: Shift+Wheel pans left/right for mice without clickable scroll wheel
{
  const res = computeWheelNavigation({
    deltaX: 0,
    deltaY: 120,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    inputMode: 'mouse',
    zoom: 1.0,
    pan: { x: 50, y: 20 },
    cursorLocal: { x: 0, y: 0 },
    minZoom: 0.25,
    maxZoom: 2.5,
  });
  assert.equal(res.zoom, 1.0);
  assert.deepEqual(res.pan, { x: -70, y: 20 });
}

// 3. Trackpad mode: 2-finger swipe pans in 2D without zooming
{
  const res = computeWheelNavigation({
    deltaX: 35,
    deltaY: -40,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    inputMode: 'trackpad',
    zoom: 1.25,
    pan: { x: 100, y: 100 },
    cursorLocal: { x: 300, y: 300 },
    minZoom: 0.25,
    maxZoom: 2.5,
  });
  assert.equal(res.zoom, 1.25);
  assert.deepEqual(res.pan, { x: 65, y: 140 });
}

// 4. Trackpad mode: pinch-to-zoom (ctrlKey=true) zooms around cursor
{
  const res = computeWheelNavigation({
    deltaX: 0,
    deltaY: -40,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    inputMode: 'trackpad',
    zoom: 1.0,
    pan: { x: 0, y: 0 },
    cursorLocal: { x: 150, y: 80 },
    minZoom: 0.25,
    maxZoom: 2.5,
  });
  assert.ok(res.zoom > 1.0);
  assert.ok(res.pan.x < 0 && res.pan.y < 0);
}

// 5. 2-finger touch gesture: simultaneous pan + pinch zoom
{
  const res = computePinchNavigation({
    prevMid: { x: 100, y: 100 },
    nextMid: { x: 120, y: 110 },
    prevDist: 100,
    nextDist: 150,
    pan: { x: 0, y: 0 },
    zoom: 1.0,
    minZoom: 0.25,
    maxZoom: 2.5,
  });
  assert.equal(res.zoom, 1.5);
  // Midpoint (120, 110) must stay anchored after pan (+20,+10) and 1.5x scale
  assert.ok(Math.abs(res.pan.x - (120 - (120 - 20) * 1.5)) < 1e-6);
  assert.ok(Math.abs(res.pan.y - (110 - (110 - 10) * 1.5)) < 1e-6);
}
console.log('✓ wheel, Shift+Wheel, Trackpad pan, pinch-zoom and 2-finger touch passed');

console.log('--- Customizable shortcuts & conflict detection ---');
resetAllShortcuts();
assert.equal(normalizeCombo('cmd + shift + z'), 'Ctrl+Shift+Z');
assert.equal(formatComboLabel('Delete'), 'Del');
assert.equal(
  eventToShortcutCombo({ key: 'h', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }),
  'H'
);
assert.equal(
  eventToShortcutCombo({ key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }),
  'Ctrl+Enter'
);
assert.equal(
  eventToShortcutCombo({ key: 'Control', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }),
  null
);

assert.ok(
  matchesCombo({ key: '+', ctrlKey: false, metaKey: false, altKey: false, shiftKey: true }, '=')
);
assert.ok(
  matchesShortcutAction({ key: 'h', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, 'tool.pan')
);

// Rebinding & conflict detection
const conflict = findShortcutConflict('R', 'tool.pan');
assert.equal(conflict?.id, 'edit.rotate');

setShortcutCombo('tool.pan', 'G', false);
assert.equal(getShortcutCombo('tool.pan'), 'G');
assert.ok(memStore.has(KEYBINDS_STORAGE_KEY));
assert.ok(
  matchesShortcutAction({ key: 'g', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, 'tool.pan')
);
assert.ok(
  !matchesShortcutAction({ key: 'h', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, 'tool.pan')
);

// Clear conflict when reassigning
setShortcutCombo('tool.pan', 'R', true);
assert.equal(getShortcutCombo('tool.pan'), 'R');
assert.equal(getShortcutCombo('edit.rotate'), '');

// Reset individual and reset all
resetShortcutCombo('tool.pan');
assert.equal(getShortcutCombo('tool.pan'), 'H');
resetAllShortcuts();
assert.equal(getShortcutCombo('edit.rotate'), 'R');
assert.ok(SHORTCUT_DEFINITIONS.length >= 25);
console.log('✓ shortcuts, conflict detection, persistence and reset passed');
