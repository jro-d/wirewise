import type { ElectricalDevice, ElectricalWire } from '../types/electrical';
import { generateSchematicModel, SchematicNode } from './schematicGenerator';
import { loadSpec } from './loadSchedule';

/**
 * Single-line diagram model built from the wiring topology instead of the workbench positions.
 *
 * Only the power circuit is kept (control wiring, neutrals and earths are left to the ladder), devices are placed in
 * tiers from the source down (source, protection, bus, feeders, loads) and several conductors between two devices
 * become one line. Ratings, cable data, fault levels and live state are attached so the view can annotate them.
 */

export type SldState = 'live' | 'tripped' | 'off';

export interface SldNode {
  id: string;
  label: string;
  symbol: SchematicNode['symbol'];
  /** Tier from the source: 0 is the supply */
  depth: number;
  x: number;
  y: number;
  /** Width of a busbar line; 0 for every other symbol */
  busWidth: number;
  /** Rating line under the name, e.g. "63 A · C · 25 kA" */
  rating: string;
  state: SldState;
  /** Prospective fault current at the device input, A */
  faultAmps?: number;
  /** Connected load of a leaf, W */
  watts?: number;
  isLeaf: boolean;
}

export interface SldEdge {
  id: string;
  fromId: string;
  toId: string;
  /** "3C 16 mm² · 35 m" */
  cable: string;
  amps: number;
  /** Largest voltage drop of the conductors, percent */
  dropPct: number;
  live: boolean;
}

export interface SldModel {
  nodes: SldNode[];
  edges: SldEdge[];
  /** Devices that have no power path to a source */
  unconnected: SldNode[];
  width: number;
  height: number;
}

export interface SldLive {
  wireCurrents?: Record<string, number>;
  wireVoltageDropPercents?: Record<string, number>;
  deviceEnergized?: Record<string, boolean>;
  trippedDevices?: string[];
  /** Potential of every `device:terminal` node; a device with a live conductor on it is drawn energized */
  nodePotentials?: Record<string, string>;
}

export const SLD_COL = 200;
export const SLD_ROW = 150;
const MARGIN_X = 120;
const MARGIN_Y = 90;

/** Symbols that belong to the control circuit and are left out of the single line */
const CONTROL_SYMBOLS = new Set<SchematicNode['symbol']>(['pushbutton', 'pushbutton3', 'estop', 'pilot', 'plc', 'relay', 'earth']);
const SOURCE_SYMBOLS = new Set<SchematicNode['symbol']>(['source3p', 'grid', 'generator', 'pv']);
const LEAF_LOADS = new Set<SchematicNode['symbol']>(['motor', 'fan', 'ac', 'heater', 'light', 'socket']);

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function ratingText(dev: ElectricalDevice): string {
  const s = dev.state as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof s.ratedAmps === 'number') bits.push(`${s.ratedAmps} A`);
  if (typeof s.tripCurve === 'string' && s.tripCurve) bits.push(String(s.tripCurve));
  const ka = typeof s.breakingKaRating === 'number' ? s.breakingKaRating : dev.kaRating;
  if (typeof ka === 'number') bits.push(`${ka} kA`);
  if (typeof s.kva === 'number') bits.push(`${s.kva} kVA`);
  return bits.join(' · ');
}

export function buildSld(
  devices: ElectricalDevice[],
  wires: ElectricalWire[],
  live: SldLive = {},
  faultByDevice: Record<string, number> = {}
): SldModel {
  const model = generateSchematicModel(devices, wires);
  const devById = new Map(devices.map((d) => [d.id, d]));
  const power = model.nodes.filter((n) => !CONTROL_SYMBOLS.has(n.symbol));
  const inPower = new Set(power.map((n) => n.id));

  // One edge per device pair; the live conductors between them are one line
  const grouped = new Map<string, { a: string; b: string; wires: ElectricalWire[] }>();
  const edgeType = new Map(model.edges.map((e) => [e.id, e.type]));
  for (const w of wires) {
    if (edgeType.get(w.id) !== 'live') continue;
    if (w.fromDeviceId === w.toDeviceId || !inPower.has(w.fromDeviceId) || !inPower.has(w.toDeviceId)) continue;
    const k = pair(w.fromDeviceId, w.toDeviceId);
    if (!grouped.has(k)) grouped.set(k, { a: w.fromDeviceId, b: w.toDeviceId, wires: [] });
    grouped.get(k)!.wires.push(w);
  }

  const adj = new Map<string, string[]>();
  for (const g of grouped.values()) {
    (adj.get(g.a) || adj.set(g.a, []).get(g.a)!).push(g.b);
    (adj.get(g.b) || adj.set(g.b, []).get(g.b)!).push(g.a);
  }

  // Roots: every supply; without one, the connected device that sits highest on the workbench
  const connected = power.filter((n) => adj.has(n.id));
  let roots = connected.filter((n) => SOURCE_SYMBOLS.has(n.symbol)).map((n) => n.id);
  if (roots.length === 0 && connected.length > 0) roots = [[...connected].sort((a, b) => a.y - b.y || a.x - b.x)[0].id];

  // Breadth-first tiers; children keep the order they have on the workbench (left to right)
  const depth = new Map<string, number>();
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  const nodeById = new Map(power.map((n) => [n.id, n]));
  const queue = [...roots];
  roots.forEach((r) => depth.set(r, 0));
  while (queue.length) {
    const id = queue.shift()!;
    const next = (adj.get(id) || []).filter((c) => !depth.has(c)).sort((a, b) => (nodeById.get(a)!.x - nodeById.get(b)!.x));
    for (const c of next) {
      depth.set(c, depth.get(id)! + 1);
      parent.set(c, id);
      (children.get(id) || children.set(id, []).get(id)!).push(c);
      queue.push(c);
    }
  }

  // Tidy tree: leaves take consecutive columns, parents are centred over their children
  const col = new Map<string, number>();
  let nextCol = 0;
  const place = (id: string) => {
    const kids = children.get(id) || [];
    if (kids.length === 0) {
      col.set(id, nextCol++);
      return;
    }
    kids.forEach(place);
    col.set(id, (col.get(kids[0])! + col.get(kids[kids.length - 1])!) / 2);
  };
  roots.forEach(place);

  const nodes: SldNode[] = [];
  const tripped = new Set(live.trippedDevices || []);
  const isLiveNode = (devId: string, termId: string) => {
    const p = live.nodePotentials?.[`${devId}:${termId}`];
    return p === 'live' || p === 'switched';
  };
  const liveDevices = new Set<string>();
  for (const w of wires) {
    if (isLiveNode(w.fromDeviceId, w.fromTerminalId)) liveDevices.add(w.fromDeviceId);
    if (isLiveNode(w.toDeviceId, w.toTerminalId)) liveDevices.add(w.toDeviceId);
  }
  for (const n of power) {
    if (!depth.has(n.id)) continue;
    const dev = devById.get(n.id)!;
    const kids = children.get(n.id) || [];
    const isBus = n.symbol === 'busbar';
    const cx = MARGIN_X + col.get(n.id)! * SLD_COL;
    const spanKids = kids.map((k) => MARGIN_X + col.get(k)! * SLD_COL);
    const spec = loadSpec(dev);
    const watts = spec ? spec.watts : typeof (dev.state as Record<string, unknown>).wattage === 'number' ? ((dev.state as Record<string, unknown>).wattage as number) : undefined;
    nodes.push({
      id: n.id,
      label: n.label,
      symbol: n.symbol,
      depth: depth.get(n.id)!,
      x: cx,
      y: MARGIN_Y + depth.get(n.id)! * SLD_ROW,
      busWidth: isBus && spanKids.length > 0 ? Math.max(...spanKids) - Math.min(...spanKids) + 80 : isBus ? 80 : 0,
      rating: ratingText(dev),
      state: tripped.has(n.id) || n.status === 'TRIPPED' ? 'tripped' : live.deviceEnergized?.[n.id] || liveDevices.has(n.id) ? 'live' : 'off',
      faultAmps: faultByDevice[n.id],
      watts: kids.length === 0 && LEAF_LOADS.has(n.symbol) ? watts : undefined,
      isLeaf: kids.length === 0,
    });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: SldEdge[] = [];
  for (const g of grouped.values()) {
    if (!byId.has(g.a) || !byId.has(g.b)) continue;
    // draw from the tier closer to the source
    const [from, to] = byId.get(g.a)!.depth <= byId.get(g.b)!.depth ? [g.a, g.b] : [g.b, g.a];
    const first = [...g.wires].sort((x, y) => (y.lengthMeters || 0) - (x.lengthMeters || 0))[0];
    const amps = Math.max(0, ...g.wires.map((w) => live.wireCurrents?.[w.id] ?? 0));
    const drop = Math.max(0, ...g.wires.map((w) => live.wireVoltageDropPercents?.[w.id] ?? 0));
    edges.push({
      id: g.wires[0].id,
      fromId: from,
      toId: to,
      cable: `${g.wires.length}C ${first.wireGauge.replace(/\s*\(.*\)$/, '')} · ${first.lengthMeters} m`,
      amps,
      dropPct: drop,
      live: g.wires.some((w) => isLiveNode(w.fromDeviceId, w.fromTerminalId) || isLiveNode(w.toDeviceId, w.toTerminalId)),
    });
  }

  const unconnected: SldNode[] = power
    .filter((n) => !depth.has(n.id))
    .map((n, i) => {
      const dev = devById.get(n.id)!;
      return {
        id: n.id,
        label: n.label,
        symbol: n.symbol,
        depth: -1,
        x: MARGIN_X + i * SLD_COL,
        y: 0,
        busWidth: 0,
        rating: ratingText(dev),
        state: 'off' as SldState,
        isLeaf: true,
      };
    });

  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
  const width = Math.max(nextCol, 1) * SLD_COL + MARGIN_X * 2;
  const baseH = MARGIN_Y + (maxDepth + 1) * SLD_ROW + 60;
  unconnected.forEach((u) => (u.y = baseH + 40));
  return { nodes, edges, unconnected, width: Math.max(width, unconnected.length * SLD_COL + MARGIN_X * 2), height: baseH + (unconnected.length ? 150 : 0) };
}
