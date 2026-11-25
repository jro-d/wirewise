import type { LadderElement, LadderNode } from '../types/ladder';
import type { PhysicalElement } from './ladderEngine';

/**
 * Pure helpers behind the vertical (IEC) ladder view: grouping rungs into networks with branching outputs,
 * path numbering, the coil to contact cross-reference, and the "Why is it off?" trace.
 */

/** One output (coil or lamp) with the contacts that feed it. This is a rung in the old model. */
export interface PathInput {
  key: string;
  label: string;
  pre: LadderNode;
  post: LadderNode;
  output: LadderElement | null;
  rungId?: string;
}

export interface NetworkOutput extends PathInput {
  /** 1-based path number across the whole ladder */
  path: number;
}

/** A shared trunk (`pre`) with one or more outputs hanging from it. */
export interface LadderNetwork {
  id: string;
  pre: LadderNode;
  outputs: NetworkOutput[];
}

/** Stable identity of an element, whether it came from the wiring or from a student ladder */
export const elementRef = (el: LadderElement) =>
  el.deviceId && el.contactKey ? `${el.deviceId}:${el.contactKey}` : `tag:${el.tag}:${el.sub}:${el.kind}`;

const isEmptyNode = (n: LadderNode): boolean => n.kind === 'series' && n.items.every(isEmptyNode);

/** Order-independent signature of a series-parallel tree (two trees with the same signature draw the same circuit) */
export function nodeSignature(node: LadderNode): string {
  if (node.kind === 'el') return elementRef(node.el);
  const kids = node.items.map(nodeSignature).filter((s) => s !== '');
  if (kids.length === 0) return '';
  if (node.kind === 'series') return kids.length === 1 ? kids[0] : `S(${kids.join('>')})`;
  return kids.length === 1 ? kids[0] : `P(${[...kids].sort().join('|')})`;
}

/**
 * Group outputs that share exactly the same contacts (and have nothing after the output) into one network:
 * a RUN lamp in parallel with its coil becomes one network with two outputs.
 */
export function groupNetworks(paths: PathInput[]): LadderNetwork[] {
  const networks: LadderNetwork[] = [];
  const bySig = new Map<string, LadderNetwork>();
  for (const p of paths) {
    const sig = nodeSignature(p.pre);
    const groupable = p.output !== null && isEmptyNode(p.post) && sig !== '';
    const existing = groupable ? bySig.get(sig) : undefined;
    if (existing) {
      existing.outputs.push({ ...p, path: 0 });
      continue;
    }
    const net: LadderNetwork = { id: `net_${networks.length}_${p.key}`, pre: p.pre, outputs: [{ ...p, path: 0 }] };
    networks.push(net);
    if (groupable) bySig.set(sig, net);
  }
  let n = 0;
  for (const net of networks) for (const o of net.outputs) o.path = ++n;
  return networks;
}

/** Every series path through a tree, as lists of elements (capped so a pathological ladder cannot explode) */
export function treePaths(node: LadderNode, cap = 64): LadderElement[][] {
  if (node.kind === 'el') return [[node.el]];
  if (node.kind === 'parallel') return node.items.flatMap((c) => treePaths(c, cap)).slice(0, cap);
  let acc: LadderElement[][] = [[]];
  for (const item of node.items) {
    const next: LadderElement[][] = [];
    for (const a of acc) for (const b of treePaths(item, cap)) next.push([...a, ...b]);
    acc = next.slice(0, cap);
  }
  return acc;
}

export const walkElements = (node: LadderNode): LadderElement[] =>
  node.kind === 'el' ? [node.el] : node.items.flatMap(walkElements);

// ───────────────────────── Cross-reference ─────────────────────────

export interface CrossRefContact {
  elId: string;
  sub: string;
  kind: 'NO' | 'NC';
  contactKey?: string;
  path: number;
}

export interface CrossRefEntry {
  deviceId: string;
  tag: string;
  coilPath: number;
  no: CrossRefContact[];
  nc: CrossRefContact[];
  /** Contacts the device has but the ladder never uses (shown as a dash with an amber mark) */
  unusedNo: number;
  unusedNc: number;
}

export interface OrphanContact {
  el: LadderElement;
  path: number;
  reason: 'no-coil' | 'generic';
}

export interface CrossRef {
  byDevice: Map<string, CrossRefEntry>;
  orphans: OrphanContact[];
  /** Coils whose device has contacts that no path uses */
  unusedCoils: string[];
}

const isContact = (e: LadderElement): e is LadderElement & { kind: 'NO' | 'NC' } => e.kind === 'NO' || e.kind === 'NC';
const isAuxContact = (key?: string) => !!key && !key.startsWith('pole');

export function buildCrossRef(networks: LadderNetwork[], elements: PhysicalElement[]): CrossRef {
  const byDevice = new Map<string, CrossRefEntry>();
  const coilDevices = new Set<string>();
  for (const e of elements) if (e.kind === 'COIL' && e.deviceId) coilDevices.add(e.deviceId);
  const outputDevices = new Set<string>();

  for (const net of networks)
    for (const o of net.outputs)
      if (o.output?.kind === 'COIL' && o.output.deviceId) {
        outputDevices.add(o.output.deviceId);
        if (!byDevice.has(o.output.deviceId))
          byDevice.set(o.output.deviceId, {
            deviceId: o.output.deviceId,
            tag: o.output.tag,
            coilPath: o.path,
            no: [],
            nc: [],
            unusedNo: 0,
            unusedNc: 0,
          });
      }

  const orphans: OrphanContact[] = [];
  const used = new Set<string>();
  const addContact = (el: LadderElement, path: number) => {
    if (!isContact(el)) return;
    if (el.deviceId && el.contactKey) used.add(`${el.deviceId}:${el.contactKey}`);
    if (!el.deviceId) {
      orphans.push({ el, path, reason: 'generic' });
      return;
    }
    if (!isAuxContact(el.contactKey)) return;
    const entry = byDevice.get(el.deviceId);
    if (entry) {
      const c: CrossRefContact = { elId: el.id, sub: el.sub, kind: el.kind, contactKey: el.contactKey, path };
      (el.kind === 'NO' ? entry.no : entry.nc).push(c);
    } else if (coilDevices.has(el.deviceId) && !outputDevices.has(el.deviceId)) {
      orphans.push({ el, path, reason: 'no-coil' });
    }
  };
  for (const net of networks) {
    const first = net.outputs[0]?.path ?? 0;
    walkElements(net.pre).forEach((el) => addContact(el, first));
    for (const o of net.outputs) walkElements(o.post).forEach((el) => addContact(el, o.path));
  }

  const unusedCoils: string[] = [];
  for (const entry of byDevice.values()) {
    for (const pe of elements) {
      if (pe.deviceId !== entry.deviceId || !isContact(pe as unknown as LadderElement) || !isAuxContact(pe.contactKey)) continue;
      if (used.has(pe.key)) continue;
      if (pe.kind === 'NO') entry.unusedNo++;
      else if (pe.kind === 'NC') entry.unusedNc++;
    }
    if (entry.no.length === 0 && entry.nc.length === 0 && entry.unusedNo + entry.unusedNc > 0) unusedCoils.push(entry.deviceId);
  }
  return { byDevice, orphans, unusedCoils };
}

// ───────────────────────── Why is it off? ─────────────────────────

export interface OffTrace {
  /** The path that is closest to conducting (fewest open contacts) */
  best: LadderElement[];
  /** First open contact on that path, in series order */
  culprit: LadderElement | null;
  openCount: number;
  /** False when the trunk has no contacts at all, so something other than a contact holds the output off */
  hasPath: boolean;
}

/** Find the first open contact that keeps an output off. `closedOf` says whether a contact conducts right now. */
export function traceOff(
  pre: LadderNode,
  post: LadderNode,
  closedOf: (el: LadderElement) => boolean
): OffTrace {
  const full: LadderNode = { kind: 'series', items: [pre, post] };
  const paths = treePaths(full);
  let best: LadderElement[] = [];
  let bestOpen = Infinity;
  for (const p of paths) {
    const open = p.filter((e) => !closedOf(e)).length;
    if (open < bestOpen) {
      bestOpen = open;
      best = p;
    }
  }
  if (!Number.isFinite(bestOpen)) return { best: [], culprit: null, openCount: 0, hasPath: false };
  const culprit = best.find((e) => !closedOf(e)) || null;
  return { best, culprit, openCount: bestOpen, hasPath: true };
}
