import assert from 'node:assert/strict';
import { nodeToBlocks, parsePhysicalLadder, physicalToLadderElement, physicalToRungs, rungToNode } from '../src/core/ladderEngine.ts';
import { buildCrossRef, groupNetworks, nodeSignature, traceOff, treePaths } from '../src/core/ladderNetworks.ts';
import { dolDevices, dolWires, dolTarget } from '../src/data/motorControlLabs.ts';

let n = 0;
const el = (kind, tag, sub = '', extra = {}) => ({ id: `e${++n}`, kind, tag, sub, ...extra });
const leaf = (e) => ({ kind: 'el', el: e });
const series = (...items) => ({ kind: 'series', items });
const parallel = (...items) => ({ kind: 'parallel', items });
const paths = (node) => treePaths(node).map((p) => p.map((e) => e.tag).join('>')).sort();

console.log('--- Nested parallel keeps its logic ---');
{
  // A in series with (B in parallel with (C in series with (D in parallel with E)))
  const [A, B, C, D, E] = ['A', 'B', 'C', 'D', 'E'].map((t) => el('NO', t));
  const tree = series(leaf(A), parallel(leaf(B), series(leaf(C), parallel(leaf(D), leaf(E)))));
  const blocks = nodeToBlocks(tree, 'x');
  assert.equal(blocks.length, 2, 'series A then one parallel block');
  assert.deepEqual(blocks[1].branches.map((br) => br.map((e) => e.tag).join('')).sort(), ['B', 'CD', 'CE']);
  // same series paths before and after
  const back = rungToNode({ id: 'r', blocks, output: null });
  assert.deepEqual(paths(back), paths(tree));
  assert.deepEqual(paths(tree), ['A>B', 'A>C>D', 'A>C>E']);
}
console.log('✓ nested parallel is distributed, not flattened into series');

console.log('\n--- Networks: a lamp in parallel with its coil shares one trunk ---');
{
  const nets = groupNetworks(
    dolTarget.map((r) => ({ key: r.id, label: r.output.tag, pre: rungToNode(r), post: series(), output: r.output, rungId: r.id }))
  );
  assert.equal(nets.length, 2, 'KM1 and PL_RUN share a network, PL_FAULT has its own');
  assert.deepEqual(nets[0].outputs.map((o) => o.output.tag), ['KM1', 'PL_RUN']);
  assert.deepEqual(nets.flatMap((x) => x.outputs.map((o) => o.path)), [1, 2, 3], 'paths are numbered 1..N across networks');
  assert.equal(nodeSignature(series(leaf(el('NO', 'A', 'x')), series())), 'tag:A:x:NO', 'empty series are ignored');
}
console.log('✓ branching outputs');

console.log('\n--- Forward/reverse: one network with a shared STOP and OLR trunk ---');
{
  const stop = el('NC', 'STOP', '1-2'), olr = el('NC', 'OLR', '95-96');
  const fwdPre = series(leaf(olr), leaf(stop), parallel(leaf(el('NO', 'FWD', '3-4')), leaf(el('NO', 'KM1', '13-14'))), leaf(el('NC', 'KM2', '21-22')));
  const revPre = series(leaf(olr), leaf(stop), parallel(leaf(el('NO', 'REV', '5-6')), leaf(el('NO', 'KM2', '13-14'))), leaf(el('NC', 'KM1', '21-22')));
  const mk = (key, pre, out) => ({ key, label: out.tag, pre, post: series(), output: out });
  const nets = groupNetworks([
    mk('a', fwdPre, el('COIL', 'KM1')),
    mk('b', fwdPre, el('LAMP', 'PL_FWD')),
    mk('c', revPre, el('COIL', 'KM2')),
    mk('d', revPre, el('LAMP', 'PL_REV')),
    mk('e', series(leaf(el('NO', 'OLR', '97-98'))), el('LAMP', 'PL_FAULT')),
  ]);
  assert.equal(nets.length, 2, 'FWD and REV share one network, the fault lamp has its own');
  const fr = nets[0];
  assert.deepEqual(treePaths(fr.pre).map((p) => p.map((e) => e.tag).join('>')), ['OLR>STOP'], 'trunk is the common STOP and OLR');
  assert.equal(fr.branches.length, 2);
  assert.deepEqual(fr.branches.map((b) => b.outputs.map((o) => o.output.tag)), [['KM1', 'PL_FWD'], ['KM2', 'PL_REV']]);
  assert.deepEqual(fr.outputs.map((o) => o.path), [1, 2, 3, 4]);
  // every output still sees the same contacts end to end
  const full = (b) => treePaths({ kind: 'series', items: [fr.pre, b.rest] }).map((p) => p.map((e) => e.tag + e.sub).sort().join('+')).sort();
  assert.deepEqual(full(fr.branches[0]), treePaths(fwdPre).map((p) => p.map((e) => e.tag + e.sub).sort().join('+')).sort());
  assert.deepEqual(full(fr.branches[1]), treePaths(revPre).map((p) => p.map((e) => e.tag + e.sub).sort().join('+')).sort());
}
console.log('✓ common prefix becomes the trunk, branches keep their own contacts');

console.log('\n--- Live ladder from the wiring + cross-reference ---');
{
  const phys = parsePhysicalLadder(dolDevices, dolWires);
  const views = phys.rungs.map((r) => ({ key: r.id, label: r.load.tag, pre: r.pre, post: r.post, output: physicalToLadderElement(r.load) }));
  const nets = groupNetworks(views);
  assert.ok(nets.length < views.length, `${views.length} rungs collapse into ${nets.length} networks`);
  const xr = buildCrossRef(nets, phys.elements);
  const km1 = xr.byDevice.get('mdol_km1');
  assert.ok(km1, 'KM1 coil has a cross-reference entry');
  assert.deepEqual(km1.no.map((c) => c.sub), ['13-14'], 'the seal-in is listed');
  assert.equal(km1.no[0].path, km1.coilPath, 'the seal-in is on the same path as its coil');
  assert.equal(km1.unusedNc, 1, 'the unused 21-22 is reported');
  assert.equal(xr.orphans.length, 0);
}
console.log('✓ coil to contact table, unused contacts');

console.log('\n--- Orphans ---');
{
  const phys = parsePhysicalLadder(dolDevices, dolWires);
  // a KM1 contact in the ladder but no KM1 coil
  const contact = el('NO', 'KM1', '13-14', { deviceId: 'mdol_km1', contactKey: 'aux_no' });
  const generic = el('NO', 'X', '1-2');
  const lamp = el('LAMP', 'PL_RUN', 'GREEN', { deviceId: 'mdol_pl_run', contactKey: 'lamp' });
  const nets = groupNetworks([{ key: 'k', label: 'PL_RUN', pre: series(leaf(contact), leaf(generic)), post: series(), output: lamp }]);
  const xr = buildCrossRef(nets, phys.elements);
  assert.deepEqual(xr.orphans.map((o) => o.reason).sort(), ['generic', 'no-coil']);
}
console.log('✓ contact without a coil and generic symbols are flagged');

console.log('\n--- Why is it off? ---');
{
  const stop = el('NC', 'STOP'), start = el('NO', 'START'), seal = el('NO', 'KM1'), olr = el('NC', 'OLR');
  const pre = series(leaf(olr), leaf(stop), parallel(leaf(start), leaf(seal)));
  const closed = (e) => e.tag === 'OLR' || e.tag === 'STOP';
  const t = traceOff(pre, series(), closed);
  assert.equal(t.openCount, 1, 'one of START / seal-in must close');
  assert.equal(t.culprit.tag, 'START', 'first open contact on the closest path');
  const blocked = traceOff(pre, series(), (e) => e.tag !== 'STOP');
  assert.equal(blocked.culprit.tag, 'STOP');
  assert.equal(traceOff(series(), series(), () => true).culprit, null);
}
console.log('✓ closest path and first open contact');

console.log('\n--- Auto-built builder rungs still verify ---');
{
  const phys = parsePhysicalLadder(dolDevices, dolWires);
  const rungs = physicalToRungs(phys);
  assert.equal(rungs.length, phys.rungs.length);
}
console.log('\nLADDER NETWORK TESTS PASSED');
