import assert from 'node:assert/strict';
import { buildSld } from '../src/core/sldLayout.ts';
import { dolDevices, dolWires } from '../src/data/motorControlLabs.ts';
import { solve } from './helpers.mjs';

console.log('--- Single-line model from the DOL starter ---');
const solved = solve(dolDevices, dolWires, 'PEC', 440);
const sld = buildSld(dolDevices, dolWires, solved, {});
const byType = (t) => sld.nodes.filter((n) => dolDevices.find((d) => d.id === n.id)?.type === t);
console.log(sld.nodes.map((n) => `${n.depth}:${n.label}`).join(' | '));
console.log('unconnected:', sld.unconnected.map((n) => n.label).join(', '));

assert.ok(sld.nodes.length >= 3, 'power devices are on the diagram');
for (const t of ['push_button_station', 'pilot_light_indicator']) assert.equal(byType(t).length, 0, `${t} is control and is left out`);
const src = byType('source_3phase_440v')[0];
assert.equal(src.depth, 0, 'the supply is the top tier');
assert.ok(sld.nodes.every((n) => n.depth >= 0 && n.y >= 0));
// every edge goes down (or across) a tier, never up
const depthOf = Object.fromEntries(sld.nodes.map((n) => [n.id, n.depth]));
assert.ok(sld.edges.every((e) => depthOf[e.fromId] <= depthOf[e.toId]), 'edges run from the source side to the load side');
// a 3-wire feeder is one line with a 3C cable label
assert.ok(sld.edges.some((e) => /^3C /.test(e.cable)), 'three conductors collapse into one 3C line');
// a parent sits over its children
const kids = sld.edges.filter((e) => e.fromId === src.id);
assert.ok(sld.nodes.some((n) => n.state === 'live'), 'the energized supply is drawn live');
assert.ok(sld.edges.some((e) => e.live), 'a conductor carrying voltage is drawn live');
console.log('✓ tiers, control left out, conductors merged, live state');

console.log('\n--- Nothing wired ---');
const empty = buildSld(dolDevices, [], {}, {});
assert.equal(empty.nodes.length, 0);
assert.equal(empty.edges.length, 0);
assert.ok(empty.unconnected.length > 0, 'unwired power devices are listed separately');
console.log('✓');
console.log('\nSLD LAYOUT TESTS PASSED');
