import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBlankProject } from '../src/data/labTemplates.ts';
import { createDeviceFromCatalog } from '../src/data/defaultComponents.ts';
import {
  PROJECT_FILE_ACCEPT,
  PROJECT_FILE_EXTENSION,
  PROJECT_FILE_MIME,
  ProjectFileError,
  parseProjectFile,
  projectFileName,
  serializeProjectFile,
} from '../src/utils/projectFile.ts';
import { SOUND_RECIPES, coilTransitions, deviceToggleSound, playSound, toggleSound } from '../src/utils/soundFx.ts';
import { SOUND_MUTED_KEY, isSoundMuted, setSoundMuted } from '../src/utils/soundSettings.ts';
import { getShortcutCombo, matchesShortcutAction } from '../src/utils/shortcuts.ts';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

console.log('--- Sound recipes ---');

for (const [name, voices] of Object.entries(SOUND_RECIPES)) {
  assert.ok(voices.length > 0, `${name} is silent`);
  for (const v of voices) {
    // Short and never loud
    assert.ok(v.gain > 0 && v.gain <= 0.5, `${name}: gain ${v.gain}`);
    assert.ok(v.dur > 0 && (v.at ?? 0) + v.dur <= 0.6, `${name}: too long`);
    if (v.kind === 'tone') assert.ok(v.from > 0 && (v.to ?? 1) > 0, `${name}: an exponential ramp cannot reach 0 Hz`);
  }
}
assert.equal(deviceToggleSound('mcb_2p'), 'breaker');
assert.equal(deviceToggleSound('rcd_2p'), 'breaker');
assert.equal(deviceToggleSound('safety_breaker_2p'), 'breaker');
assert.equal(deviceToggleSound('switch_1gang'), 'switch');

console.log('--- Mute switch ---');

let oscillators = 0;
const node = () => ({
  connect() {},
  start() {},
  stop() {},
  frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
  gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
  Q: { value: 0 },
});
globalThis.window = {
  AudioContext: class {
    state = 'running';
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    createGain = node;
    createBiquadFilter = node;
    createBufferSource = node;
    createBuffer = (_c, size) => ({ getChannelData: () => new Float32Array(size) });
    createOscillator = () => {
      oscillators++;
      return node();
    };
  },
};

assert.equal(isSoundMuted(), false, 'sound is on until it is turned off');
playSound('switch');
assert.equal(oscillators, 1);
assert.equal(toggleSound(), true);
assert.equal(mem.get(SOUND_MUTED_KEY), '1');
playSound('breaker');
playSound('beep');
assert.equal(oscillators, 1, 'nothing plays while muted, buzzers included');
assert.equal(toggleSound(), false);
assert.equal(mem.has(SOUND_MUTED_KEY), false);
assert.equal(oscillators, 2, 'turning sound on answers with a click');
// A held key must not stutter the "not allowed" buzz
playSound('blocked');
playSound('blocked');
assert.equal(oscillators, 4);
// Every sound plays through the engine without throwing
for (const name of Object.keys(SOUND_RECIPES)) playSound(name);
{
  const setItem = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => {
    throw new Error('full');
  };
  setSoundMuted(true);
  assert.equal(isSoundMuted(), true, 'the switch still works when storage fails');
  globalThis.localStorage.setItem = setItem;
  setSoundMuted(false);
}

assert.equal(getShortcutCombo('sound.toggle'), 'Alt+S');
assert.ok(matchesShortcutAction({ key: 's', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, 'sound.toggle'));

console.log('--- Contactor clicks ---');

const coil = (id, on) => ({ id, state: { coilEnergized: on } });
{
  const first = coilTransitions(new Set(), [coil('km1', true), coil('km2', false)]);
  assert.deepEqual([...first.energized], ['km1']);
  assert.deepEqual([first.pulledIn, first.droppedOut], [true, false]);
  const same = coilTransitions(first.energized, [coil('km1', true)]);
  assert.deepEqual([same.pulledIn, same.droppedOut], [false, false]);
  const swap = coilTransitions(first.energized, [coil('km1', false), coil('km2', true)]);
  assert.deepEqual([swap.pulledIn, swap.droppedOut], [true, true]);
}

console.log('--- .wirewise project files ---');

const project = createBlankProject('IEC');
project.title = 'DOL Starter';
project.devices = [createDeviceFromCatalog('mcb_2p', 100, 100, 'q1'), createDeviceFromCatalog('contactor_3p', 300, 100, 'km1')];
project.devices[0].state.tripped = true;

const text = serializeProjectFile(project, '1.1.0');
const saved = JSON.parse(text);
assert.equal(saved.fileFormat, 'wirewise-project');
assert.equal(saved.formatVersion, 1);
assert.equal(saved.appVersion, '1.1.0');
// Releases without the format read the project from the top level
assert.equal(saved.devices.length, 2);
assert.ok(!saved.devices[0].state.tripped, 'saved de-energized');
assert.equal(project.devices[0].state.tripped, true, 'saving leaves the open project alone');

const opened = parseProjectFile(text);
assert.equal(opened.title, 'DOL Starter');
assert.equal(opened.codeStandard, 'IEC');
assert.deepEqual(opened.devices.map((d) => d.id), ['q1', 'km1']);
for (const key of ['fileFormat', 'formatVersion', 'appVersion']) assert.ok(!(key in opened), `${key} is not part of the project`);
assert.equal(parseProjectFile(`﻿${text}`).title, 'DOL Starter');

// An older .json export has no header
const { fileFormat, formatVersion, appVersion, ...legacy } = saved;
assert.equal(parseProjectFile(JSON.stringify(legacy)).devices.length, 2);
// A bare file gets sensible defaults
const bare = parseProjectFile('{"devices":[],"wires":[]}');
assert.equal(bare.codeStandard, 'PEC');
assert.ok(bare.id && bare.title);

const refused = (input, pattern) => assert.throws(() => parseProjectFile(input), (e) => e instanceof ProjectFileError && pattern.test(e.message), input.slice(0, 60));
refused('not json', /not a WireWise project/);
refused('null', /not a WireWise project/);
refused('{"devices":[]}', /not a WireWise project/);
refused(JSON.stringify({ ...saved, fileFormat: 'something-else' }), /not a WireWise project/);
refused(JSON.stringify({ ...saved, formatVersion: 2, appVersion: '2.0.0' }), /newer WireWise \(v2\.0\.0\)/);
refused('{"devices":[null],"wires":[]}', /damaged/);

assert.equal(projectFileName('DOL Starter', 'IEC'), 'dol_starter_IEC.wirewise');
assert.equal(projectFileName('../..\\a:b*?"<>|', 'PEC'), 'a_b_PEC.wirewise');
assert.equal(projectFileName('Señal 3Φ', 'PEC'), 'señal_3φ_PEC.wirewise');
assert.equal(projectFileName('', 'PEC'), 'wirewise_project_PEC.wirewise');
assert.ok(PROJECT_FILE_ACCEPT.split(',').includes('.json'));

console.log('--- Desktop file association and deploy ---');

const tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const association = tauri.bundle.fileAssociations[0];
assert.deepEqual(association.ext, [PROJECT_FILE_EXTENSION.slice(1)]);
assert.equal(association.mimeType, PROJECT_FILE_MIME);
const rust = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
assert.match(rust, new RegExp(`const PROJECT_EXTENSION: &str = "${PROJECT_FILE_EXTENSION.slice(1)}";`));
const bridge = fs.readFileSync('src/utils/desktopBridge.ts', 'utf8');
for (const name of ['desktop_take_opened_file', 'desktop:open-file']) {
  assert.ok(rust.includes(name) && bridge.includes(name), `${name} is used on both sides`);
}
// A re-run must not leave Pages with two artifacts of one name
const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
assert.equal(deploy.match(/github-pages-\$\{\{ github\.run_attempt \}\}/g)?.length, 2);

console.log('Turn 3 sound and file tests passed');
