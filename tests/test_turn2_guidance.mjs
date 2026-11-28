import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pkg from '../package.json';
import { CHANGE_KINDS, MAX_BULLETS_PER_KIND, RELEASES } from '../src/data/changelog.ts';
import { HELP_SECTIONS, searchHelp } from '../src/data/helpContent.ts';
import { WALKTHROUGH_STEPS } from '../src/data/walkthroughSteps.ts';
import { overlapArea, placeCoachmark, placeSheet } from '../src/utils/coachmarkPlacement.ts';
import {
  LAST_SEEN_VERSION_KEY,
  WALKTHROUGH_SEEN_KEY,
  compareVersions,
  createGuideStore,
  planLaunch,
} from '../src/utils/guideStorage.ts';
import { plainKeyText, shortcutTokens, splitKeyText } from '../src/utils/keyText.ts';
import { SHORTCUT_DEFINITIONS, getShortcutCombo, matchesShortcutAction } from '../src/utils/shortcuts.ts';

console.log('--- First launch and What\'s New ---');

const base = { appVersion: '1.2.0', walkthroughSeen: true, lastSeenVersion: '1.2.0', hasReleaseNotes: true, openedFromFile: false, viewOnly: false };
const plan = (over) => planLaunch({ ...base, ...over });

// First run, and people updating from a release that stored nothing: walkthrough only
assert.deepEqual(plan({ walkthroughSeen: false, lastSeenVersion: null }), { walkthrough: true, whatsNew: false, storeVersion: true });
// Walkthrough still unseen after a version bump: walkthrough wins, never both
assert.deepEqual(plan({ walkthroughSeen: false, lastSeenVersion: '1.1.0' }), { walkthrough: true, whatsNew: false, storeVersion: true });
// Updated: What's New once, version stored only when it is dismissed
assert.deepEqual(plan({ lastSeenVersion: '1.1.0' }), { walkthrough: false, whatsNew: true, storeVersion: false });
// Same version, downgrade and a missing record: nothing to show
assert.deepEqual(plan({}), { walkthrough: false, whatsNew: false, storeVersion: false });
assert.deepEqual(plan({ lastSeenVersion: '1.3.0' }), { walkthrough: false, whatsNew: false, storeVersion: true });
assert.deepEqual(plan({ lastSeenVersion: null }), { walkthrough: false, whatsNew: false, storeVersion: true });
// No notes for this version: stay quiet
assert.deepEqual(plan({ lastSeenVersion: '1.1.0', hasReleaseNotes: false }), { walkthrough: false, whatsNew: false, storeVersion: true });
// Share links and saved .html files: nothing shown, nothing remembered
assert.deepEqual(plan({ walkthroughSeen: false, lastSeenVersion: null, openedFromFile: true }), { walkthrough: false, whatsNew: false, storeVersion: false });
// Phone: no walkthrough, update notes still work
assert.equal(plan({ walkthroughSeen: false, lastSeenVersion: null, viewOnly: true }).walkthrough, false);
assert.equal(plan({ walkthroughSeen: false, lastSeenVersion: '1.1.0', viewOnly: true }).whatsNew, true);

assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
assert.ok(compareVersions('v1.0.2', '1.1.0') < 0);
assert.equal(compareVersions('1.1.0', '1.1'), 0);

console.log('--- Guide storage ---');

{
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createGuideStore(() => storage);
  assert.equal(store.walkthroughSeen(), false);
  store.markWalkthroughSeen();
  store.setLastSeenVersion('1.1.0');
  store.setUnreadNotes(true);
  assert.equal(mem.get(WALKTHROUGH_SEEN_KEY), '1');
  assert.equal(mem.get(LAST_SEEN_VERSION_KEY), '1.1.0');
  assert.equal(createGuideStore(() => storage).hasUnreadNotes(), true);
  store.setUnreadNotes(false);
  assert.equal(createGuideStore(() => storage).hasUnreadNotes(), false);
}
{
  // Blocked storage: remembered for the session, so nothing nags twice
  const store = createGuideStore(() => {
    throw new Error('blocked');
  });
  assert.equal(store.walkthroughSeen(), false);
  store.markWalkthroughSeen();
  store.setLastSeenVersion('1.1.0');
  assert.equal(store.walkthroughSeen(), true);
  assert.equal(store.lastSeenVersion(), '1.1.0');
}

console.log('--- Changelog and versions ---');

const root = path.resolve(process.cwd());
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
assert.equal(RELEASES[0].version, pkg.version, 'the newest changelog entry must match package.json');
assert.equal(json('src-tauri/tauri.conf.json').version, pkg.version);
assert.match(fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'), new RegExp(`^version = "${pkg.version}"`, 'm'));
for (let i = 0; i < RELEASES.length; i++) {
  const r = RELEASES[i];
  if (i > 0) {
    assert.ok(compareVersions(RELEASES[i - 1].version, r.version) > 0, 'releases are listed newest first');
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, `${r.version} is released and needs a date`);
  }
  assert.ok(r.summary.length > 0);
  for (const kind of CHANGE_KINDS) assert.ok((r.changes[kind]?.length ?? 0) <= MAX_BULLETS_PER_KIND, `${r.version} ${kind}: at most five bullets`);
}

console.log('--- Help and walkthrough copy ---');

const ids = new Set(SHORTCUT_DEFINITIONS.map((d) => d.id));
const copy = [
  ...HELP_SECTIONS.flatMap((s) => [s.lead ?? '', ...s.groups.flatMap((g) => g.rows.map((r) => r.text))]),
  ...WALKTHROUGH_STEPS.flatMap((s) => [s.body, ...s.keys]),
  ...RELEASES.flatMap((r) => Object.values(r.changes).flat().map((b) => b.text)),
];
for (const line of copy) for (const token of shortcutTokens(line)) assert.ok(ids.has(token), `unknown shortcut {${token}} in "${line}"`);

assert.equal(WALKTHROUGH_STEPS.length, 6);
for (const step of WALKTHROUGH_STEPS) {
  assert.ok(step.keys.length <= 5, `${step.title}: at most five key chips`);
  assert.ok(step.rings.length > 0 || step.needsDevice);
}
// Every walkthrough target exists in the app's markup
const source = ['layout', 'layout/topbar', 'canvas', 'devices']
  .flatMap((dir) => fs.readdirSync(path.join(root, 'src/components', dir)).filter((f) => f.endsWith('.tsx')).map((f) => path.join(root, 'src/components', dir, f)))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');
const selectors = WALKTHROUGH_STEPS.flatMap((s) => [...s.rings.flat(), ...(s.panel ? [s.panel.selector, s.panel.toggle] : [])]);
for (const selector of selectors) {
  const name = selector.match(/data-tour="([^"]+)"/)[1];
  assert.ok(new RegExp(`(data-tour|dataTour)="${name}"`).test(source), `no element is marked ${name}`);
}

assert.deepEqual(splitKeyText('Press {tool.pan}, or {=Space}.', () => 'H'), [
  { text: 'Press ', key: false },
  { text: 'H', key: true },
  { text: ', or ', key: false },
  { text: 'Space', key: true },
  { text: '.', key: false },
]);
assert.equal(plainKeyText('{panel.help} opens Help', getShortcutCombo), 'F1 opens Help');

assert.equal(searchHelp('').length, HELP_SECTIONS.length);
assert.deepEqual(searchHelp('ground fault'), []);
{
  const pan = searchHelp('pan');
  assert.deepEqual(pan.map((s) => s.id), ['controls']);
  assert.deepEqual(pan[0].groups.flatMap((g) => g.rows.map((r) => r.label)), ['Pan tool', 'Quick pan', 'Pan and zoom']);
  // A matching section title keeps every row
  assert.equal(searchHelp('wiring and')[0].groups[0].rows.length, HELP_SECTIONS[2].groups[0].rows.length);
}

console.log('--- F1 shortcut ---');

const key = (k) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
assert.equal(getShortcutCombo('panel.help'), 'F1');
assert.ok(matchesShortcutAction(key('F1'), 'panel.help'));
assert.ok(!matchesShortcutAction(key('F2'), 'panel.help'));

console.log('--- Coachmark placement ---');

const viewport = { width: 1280, height: 720 };
const card = { width: 360, height: 280 };
const inside = (p) => p.left >= 0 && p.top >= 0 && p.left + card.width <= viewport.width && p.top + card.height <= viewport.height;
const boxAt = (p) => ({ ...p, ...card });
{
  // Overflow button at the top right with the inspector below it
  const overflow = { left: 1230, top: 12, width: 32, height: 32 };
  const inspector = { left: 936, top: 92, width: 344, height: 600 };
  const p = placeCoachmark({ viewport, card, targets: [overflow], obstacles: [inspector] });
  assert.ok(inside(p));
  assert.equal(overlapArea(boxAt(p), overflow), 0);
  assert.equal(overlapArea(boxAt(p), inspector), 0);
}
{
  // Library drawer: the card sits beside it
  const drawer = { left: 12, top: 104, width: 320, height: 580 };
  const p = placeCoachmark({ viewport, card, targets: [drawer], obstacles: [drawer] });
  assert.ok(inside(p));
  assert.equal(overlapArea(boxAt(p), drawer), 0);
  assert.ok(p.left >= 332 && p.left <= 360);
}
assert.deepEqual(placeCoachmark({ viewport, card, targets: [] }), { left: 460, top: 220 });
{
  // A device near the top of the canvas: the card stays below the top bar
  const device = { left: 440, top: 140, width: 120, height: 70 };
  const p = placeCoachmark({ viewport, card, targets: [device], minTop: 66 });
  assert.ok(p.top >= 66);
  assert.equal(overlapArea(boxAt(p), device), 0);
}
{
  const tablet = { width: 900, height: 700 };
  const bottomRight = placeSheet({ viewport: tablet, height: 260, targets: [], topInset: 66, bottomInset: 38 });
  assert.deepEqual(bottomRight, { left: 10, right: 10, bottom: 38 });
  // A tall drawer on the left narrows the sheet
  const beside = placeSheet({ viewport: tablet, height: 260, targets: [{ left: 12, top: 100, width: 320, height: 560 }], topInset: 66, bottomInset: 38 });
  assert.equal(beside.left, 342);
  // A ring near the bottom moves the sheet to the top
  const moved = placeSheet({ viewport: tablet, height: 260, targets: [{ left: 200, top: 560, width: 500, height: 60 }], topInset: 66, bottomInset: 38 });
  assert.equal(moved.top, 66);
  assert.equal(moved.bottom, undefined);
}

console.log('Turn 2 guidance tests passed');
