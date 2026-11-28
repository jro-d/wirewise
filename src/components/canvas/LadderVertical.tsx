import React, { useEffect, useMemo, useRef } from 'react';
import type { LadderElement, LadderNode } from '../../types/ladder';
import { measure } from '../../core/ladderEngine';
import type { CrossRef, CrossRefContact, LadderNetwork, NetworkOutput } from '../../core/ladderNetworks';

/**
 * Vertical (IEC) ladder: two horizontal rails, current paths as columns, power flowing top to bottom.
 * Series contacts stack downward, a parallel branch is a side-by-side column joined by short bars, and several
 * outputs can hang from one shared trunk. Under each coil sits a table of the paths its contacts are used on.
 */

export const COLW = 132; // width of one branch column
export const ROWH = 64; // pitch between stacked elements
const LEFT = 56;
const GAP = 36;
const HDR_Y = 20;
const HDR_H = 44;
const TOP_Y = 112; // top rail
const XREF_H = 150; // room under the last row for the cross-reference table

export interface LadderVerticalProps {
  networks: LadderNetwork[];
  crossRef: CrossRef;
  isClosed: (el: LadderElement) => boolean;
  loadEnergized: (el: LadderElement | null, preOut: boolean) => boolean;
  railsLive: boolean;
  isSimulating: boolean;
  railTopLabel: string;
  railBottomLabel: string;
  lampColors: Record<string, string>;
  zoom: number;
  pan?: { x: number; y: number };
  svgRef?: React.RefObject<SVGSVGElement | null>;
  cursorClass?: string;
  onCanvasMouseDown?: (e: React.MouseEvent) => void;
  onCanvasMouseMove?: (e: React.MouseEvent) => void;
  onCanvasMouseUp?: () => void;
  onCanvasWheel?: (e: React.WheelEvent) => void;
  onCanvasTouchStart?: (e: React.TouchEvent) => void;
  onCanvasTouchMove?: (e: React.TouchEvent) => void;
  onCanvasTouchEnd?: () => void;
  onCenterPoint?: (x: number, y: number) => void;
  onReportBounds?: (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => void;
  selectedElId?: string | null;
  selectedDeviceId?: string | null;
  hoverDeviceId?: string | null;
  /** Briefly ring this element (set after a cross-reference click) */
  focusEl?: { id: string; nonce: number } | null;
  /** Element that keeps an output off, with the output it belongs to (the "Why is it off?" trace) */
  explain?: { outputKey: string; culpritId: string | null } | null;
  selectedPathKey?: string | null;
  onElMouseDown: (el: LadderElement, e: React.MouseEvent) => void;
  onElHover: (el: LadderElement | null) => void;
  onXrefClick: (c: CrossRefContact) => void;
  onXrefHover: (deviceId: string | null) => void;
  onExplain: (out: NetworkOutput) => void;
  onSelectPath?: (out: NetworkOutput) => void;
}

interface Ctx {
  parts: React.ReactNode[];
  x0: number;
  isClosed: LadderVerticalProps['isClosed'];
  props: LadderVerticalProps;
  pos: Map<string, { x: number; y: number }>;
  keyPrefix: string;
}

const edgeY = (row: number) => TOP_Y + row * ROWH;
const rowY = (row: number) => edgeY(row) + ROWH / 2;
const colX = (ctx: Ctx, col: number) => ctx.x0 + col * COLW;

function wire(ctx: Ctx, key: string, x1: number, y1: number, x2: number, y2: number, on: boolean) {
  if (x1 === x2 && y1 === y2) return;
  ctx.parts.push(
    <line
      key={key}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={on ? 'var(--ok)' : 'var(--ink-muted)'}
      strokeWidth={on ? 2.5 : 1.25}
      strokeLinecap="round"
      className={on ? 'wire-flow' : undefined}
    />
  );
}

const dot = (ctx: Ctx, key: string, x: number, y: number, on: boolean) =>
  ctx.parts.push(
    <circle key={key} cx={x} cy={y} r={3.5} fill={on ? 'var(--ok)' : 'var(--canvas)'} stroke={on ? 'var(--ok)' : 'var(--ink-muted)'} strokeWidth={1.25} />
  );

const PUSHBUTTON_KEYS = new Set(['start', 'stop', 'fwd', 'rev', 'estop']);
const THERMAL_KEYS = new Set(['trip_nc', 'alarm_no']);

function drawContact(ctx: Ctx, el: LadderElement, x: number, row: number, powered: boolean, key: string): boolean {
  const p = ctx.props;
  const y = rowY(row);
  const closed = ctx.isClosed(el);
  const passes = powered && closed;
  const blocked = powered && !closed && el.kind === 'NC';
  const tone = passes ? 'var(--ok)' : blocked ? 'var(--danger)' : closed ? 'var(--ink)' : 'var(--ink-muted)';
  const sw = passes || blocked ? 2.5 : closed ? 1.75 : 1.25;
  const isSel = p.selectedElId === el.id;
  const linkedSel = !!el.deviceId && p.selectedDeviceId === el.deviceId;
  const hovered = !!el.deviceId && p.hoverDeviceId === el.deviceId;
  const flashing = p.focusEl?.id === el.id;
  const culprit = p.explain?.culpritId === el.id;
  const generic = !el.deviceId;
  const op = PUSHBUTTON_KEYS.has(el.contactKey || '') ? 'pb' : THERMAL_KEYS.has(el.contactKey || '') ? 'th' : null;
  ctx.pos.set(el.id, { x, y });

  wire(ctx, `${key}-t`, x, y - ROWH / 2, x, y - 14, powered);
  wire(ctx, `${key}-b`, x, y + 14, x, y + ROWH / 2, passes);

  const blade =
    el.kind === 'NO'
      ? closed
        ? `M ${x} ${y + 14} L ${x} ${y - 14}`
        : `M ${x} ${y + 14} L ${x + 11} ${y - 9}`
      : closed
        ? `M ${x} ${y + 14} L ${x + 8} ${y - 14}`
        : `M ${x} ${y + 14} L ${x + 11} ${y - 9}`;
  const tagX = x - (op ? 38 : 16);
  ctx.parts.push(
    <g
      key={`${key}-sym`}
      className="cursor-pointer"
      onMouseDown={(e) => p.onElMouseDown(el, e)}
      onMouseEnter={() => p.onElHover(el)}
      onMouseLeave={() => p.onElHover(null)}
    >
      <rect x={x - 70} y={y - 30} width={140} height={60} rx={8} fill="transparent" />
      {(hovered || flashing) && (
        <rect
          x={x - (op ? 32 : 14)}
          y={y - 22}
          width={op ? 56 : 40}
          height={44}
          rx={8}
          fill="var(--brand-soft)"
          stroke="var(--brand)"
          strokeWidth={flashing ? 3 : 1.5}
          className={flashing ? 'animate-pulse' : undefined}
        />
      )}
      {generic && (
        <rect x={x - (op ? 32 : 16)} y={y - 22} width={op ? 58 : 44} height={44} rx={6} fill="none" stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="4 3" />
      )}
      {(isSel || linkedSel) && (
        <rect
          x={x - (op ? 34 : 18)}
          y={y - 24}
          width={op ? 60 : 44}
          height={48}
          rx={7}
          fill="none"
          stroke="var(--probe)"
          strokeWidth={2}
          strokeDasharray={isSel ? undefined : '4 3'}
        />
      )}
      {isSel &&
        [
          [x - (op ? 34 : 18), y - 24],
          [x + (op ? 26 : 26), y - 24],
          [x - (op ? 34 : 18), y + 24],
          [x + (op ? 26 : 26), y + 24],
        ].map(([hx, hy], i) => <rect key={i} x={hx - 3} y={hy - 3} width={6} height={6} fill="var(--surface)" stroke="var(--probe)" strokeWidth={1.5} />)}
      <path d={blade} stroke={tone} strokeWidth={sw} fill="none" strokeLinecap="round" />
      {el.kind === 'NC' && <path d={`M ${x - 5} ${y - 14} H ${x + 13}`} stroke={tone} strokeWidth={sw} strokeLinecap="round" />}
      <circle cx={x} cy={y - 14} r={2} fill={tone} />
      <circle cx={x} cy={y + 14} r={2} fill={tone} />
      {op === 'pb' && (
        <>
          <path d={`M ${x + 5} ${y + 2} H ${x - 22}`} stroke={tone} strokeWidth={1.25} strokeDasharray="3 2.5" />
          <path d={`M ${x - 22} ${y - 4} V ${y + 8}`} stroke={tone} strokeWidth={1.25} strokeLinecap="round" />
          {el.contactKey === 'estop' && <circle cx={x - 27} cy={y + 2} r={6} fill="var(--surface)" stroke={tone} strokeWidth={1.25} />}
        </>
      )}
      {op === 'th' && (
        <>
          <path d={`M ${x + 5} ${y + 2} H ${x - 14}`} stroke={tone} strokeWidth={1.25} strokeDasharray="3 2.5" />
          <rect x={x - 30} y={y - 4} width={16} height={12} rx={2} fill="none" stroke={tone} strokeWidth={1.25} />
          <path d={`M ${x - 27} ${y + 5} L ${x - 22} ${y - 1} L ${x - 17} ${y + 5}`} fill="none" stroke={tone} strokeWidth={1.25} />
        </>
      )}
      <text x={tagX} y={y + 4} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-mono)">
        {el.tag}
      </text>
      <text x={x + 18} y={y + 4} fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">
        {el.sub}
      </text>
      {blocked && (
        <g>
          <circle cx={x + 40} cy={y - 18} r={8} fill="var(--danger-soft)" stroke="var(--danger)" strokeWidth={1.5} />
          <path d={`M ${x + 36.5} ${y - 21.5} l7 7 M ${x + 43.5} ${y - 21.5} l-7 7`} stroke="var(--danger)" strokeWidth={1.8} strokeLinecap="round" />
        </g>
      )}
      {generic && (
        <g>
          <circle cx={x + 30} cy={y - 22} r={8} fill="var(--warning-fill)" stroke="var(--warning)" strokeWidth={1} />
          <text x={x + 30} y={y - 18} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--ink)" fontFamily="var(--font-mono)">!</text>
        </g>
      )}
      {culprit && (
        <g>
          <rect x={x - 38} y={y - 28} width={92} height={56} rx={8} fill="none" stroke="var(--danger)" strokeWidth={2.5} strokeDasharray="5 3" />
          <rect x={x - 104} y={y + 10} width={64} height={18} rx={9} fill="var(--danger-soft)" stroke="var(--danger)" />
          <text x={x - 72} y={y + 23} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--danger)" fontFamily="var(--font-mono)">
            first open
          </text>
        </g>
      )}
    </g>
  );
  return passes;
}

function drawOutput(ctx: Ctx, out: NetworkOutput, x: number, row: number, powered: boolean, energized: boolean): void {
  const p = ctx.props;
  const el = out.output;
  const y = rowY(row);
  wire(ctx, `${out.key}-ot`, x, y - ROWH / 2, x, y - 14, powered);
  wire(ctx, `${out.key}-ob`, x, y + 14, x, y + ROWH / 2, energized);
  if (!el) {
    ctx.parts.push(
      <g key={`${out.key}-empty`}>
        <rect x={x - 16} y={y - 14} width={32} height={28} rx={2} fill="none" stroke="var(--border-strong)" strokeWidth={1.6} strokeDasharray="3 3" />
        <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="var(--ink-muted)" fontWeight={700}>
          OUT?
        </text>
      </g>
    );
    return;
  }
  ctx.pos.set(el.id, { x, y });
  const isSel = p.selectedElId === el.id;
  const linkedSel = !!el.deviceId && p.selectedDeviceId === el.deviceId;
  const hovered = !!el.deviceId && p.hoverDeviceId === el.deviceId;
  const blocked = powered && !energized;
  const tone = energized ? 'var(--ok)' : blocked ? 'var(--danger)' : 'var(--ink)';
  const lamp = el.kind === 'LAMP';
  const lampColor = p.lampColors[(el.sub || '').toUpperCase()] || 'var(--ok)';
  const generic = !el.deviceId;
  ctx.parts.push(
    <g
      key={`${out.key}-out`}
      className="cursor-pointer"
      onMouseDown={(e) => p.onElMouseDown(el, e)}
      onMouseEnter={() => p.onElHover(el)}
      onMouseLeave={() => p.onElHover(null)}
    >
      <rect x={x - 70} y={y - 30} width={140} height={60} rx={8} fill="transparent" />
      {hovered && <rect x={x - 26} y={y - 22} width={52} height={44} rx={8} fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth={1.5} />}
      {generic && <rect x={x - 24} y={y - 22} width={48} height={44} rx={6} fill="none" stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="4 3" />}
      {(isSel || linkedSel) && (
        <rect x={x - 28} y={y - 24} width={56} height={48} rx={8} fill="none" stroke="var(--probe)" strokeWidth={2} strokeDasharray={isSel ? undefined : '4 3'} />
      )}
      {isSel &&
        [
          [x - 28, y - 24],
          [x + 28, y - 24],
          [x - 28, y + 24],
          [x + 28, y + 24],
        ].map(([hx, hy], i) => <rect key={i} x={hx - 3} y={hy - 3} width={6} height={6} fill="var(--surface)" stroke="var(--probe)" strokeWidth={1.5} />)}
      {lamp ? (
        <>
          {energized && <circle cx={x} cy={y} r={17} fill={lampColor} opacity={0.25} className="animate-pulse" />}
          <circle cx={x} cy={y} r={11} fill={energized ? lampColor : 'var(--surface)'} stroke={tone} strokeWidth={energized ? 2.5 : 1.75} />
          <path d={`M ${x - 7.8} ${y - 7.8} L ${x + 7.8} ${y + 7.8} M ${x + 7.8} ${y - 7.8} L ${x - 7.8} ${y + 7.8}`} stroke={tone} strokeWidth={1.75} strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x={x - 16} y={y - 14} width={32} height={28} rx={2} fill={energized ? 'var(--ok-soft)' : 'var(--surface)'} stroke={tone} strokeWidth={energized ? 2.5 : 1.75} />
          {energized && <path d={`M ${x - 7} ${y + 1} l5 5 l9 -11`} fill="none" stroke="var(--ok)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        </>
      )}
      <text x={x - (lamp ? 20 : 22)} y={y + 4} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-mono)">
        {el.tag}
      </text>
      {el.sub === 'A1-A2' ? (
        <>
          <text x={x + 22} y={y - 4} fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">A1</text>
          <text x={x + 22} y={y + 12} fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">A2</text>
        </>
      ) : (
        <text x={x + 22} y={y + 4} fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">
          {el.sub}
        </text>
      )}
      {generic && (
        <g>
          <circle cx={x + 24} cy={y - 22} r={8} fill="var(--warning-fill)" stroke="var(--warning)" strokeWidth={1} />
          <text x={x + 24} y={y - 18} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--ink)" fontFamily="var(--font-mono)">!</text>
        </g>
      )}
    </g>
  );
  if (p.isSimulating && !energized && p.railsLive) {
    ctx.parts.push(
      <g key={`${out.key}-why`} className="cursor-pointer" onMouseDown={(e) => { e.stopPropagation(); p.onExplain(out); }}>
        <title>Why is {el.tag} off?</title>
        <circle cx={x + 44} cy={y + 24} r={11} fill={p.explain?.outputKey === out.key ? 'var(--brand)' : 'var(--surface)'} stroke="var(--brand)" strokeWidth={1.5} />
        <text x={x + 44} y={y + 28} textAnchor="middle" fontSize={12} fontWeight={800} fill={p.explain?.outputKey === out.key ? 'var(--on-brand)' : 'var(--brand)'} fontFamily="var(--font-mono)">?</text>
      </g>
    );
  }
}

/** Recursively draw a series-parallel tree top to bottom; returns the downstream power state and the rows used */
function drawNode(ctx: Ctx, node: LadderNode, colStart: number, colSpan: number, row: number, powered: boolean, key: string): { out: boolean; rows: number } {
  if (node.kind === 'el') {
    const x = colX(ctx, colStart + colSpan / 2);
    return { out: drawContact(ctx, node.el, x, row, powered, key), rows: 1 };
  }
  if (node.kind === 'series') {
    let pw = powered;
    let r = row;
    node.items.forEach((child, i) => {
      const res = drawNode(ctx, child, colStart, colSpan, r, pw, `${key}.${i}`);
      pw = res.out;
      r += res.rows;
    });
    return { out: pw, rows: r - row };
  }
  const m = measure(node);
  const total = m.h;
  const cx = colX(ctx, colStart + colSpan / 2);
  let c = colStart + (colSpan - total) / 2;
  const results: { x: number; out: boolean; rows: number }[] = [];
  node.items.forEach((child, i) => {
    const cc = Math.max(1, measure(child).h);
    const res = drawNode(ctx, child, c, cc, row, powered, `${key}|${i}`);
    results.push({ x: colX(ctx, c + cc / 2), out: res.out, rows: res.rows });
    c += cc;
  });
  const rowsMax = Math.max(1, ...results.map((r) => r.rows));
  const any = results.some((r) => r.out);
  const yTop = edgeY(row);
  const yBot = edgeY(row + rowsMax);
  results.forEach((r, i) => {
    if (r.rows < rowsMax) wire(ctx, `${key}|${i}-fill`, r.x, edgeY(row + r.rows), r.x, yBot, r.out);
  });
  const xs = results.map((r) => r.x);
  wire(ctx, `${key}-bt`, Math.min(...xs), yTop, Math.max(...xs), yTop, powered);
  wire(ctx, `${key}-bb`, Math.min(...xs), yBot, Math.max(...xs), yBot, any);
  dot(ctx, `${key}-jt`, cx, yTop, powered);
  dot(ctx, `${key}-jb`, cx, yBot, any);
  return { out: any, rows: rowsMax };
}

function XrefTable({ ctx, out, x, y }: { ctx: Ctx; out: NetworkOutput; x: number; y: number }) {
  const p = ctx.props;
  const dev = out.output?.deviceId;
  const entry = dev ? p.crossRef.byDevice.get(dev) : undefined;
  if (!entry || out.output?.kind !== 'COIL') return null;
  const no = [...entry.no.map((c) => ({ c, unused: false })), ...Array.from({ length: entry.unusedNo }, () => ({ c: null as CrossRefContact | null, unused: true }))];
  const nc = [...entry.nc.map((c) => ({ c, unused: false })), ...Array.from({ length: entry.unusedNc }, () => ({ c: null as CrossRefContact | null, unused: true }))];
  const rows = Math.max(1, Math.min(4, Math.max(no.length, nc.length)));
  const W = 112;
  const H = 22 + 18 + rows * 22 + 6;
  const cell = (item: { c: CrossRefContact | null; unused: boolean } | undefined, cx: number, cy: number) => {
    if (!item) return null;
    if (item.unused || !item.c)
      return (
        <g key={`u-${cx}-${cy}`}>
          <text x={cx - 8} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--warning)" fontFamily="var(--font-mono)">–</text>
          <circle cx={cx + 8} cy={cy} r={6} fill="var(--warning-fill)" stroke="var(--warning)" />
          <text x={cx + 8} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--ink)" fontFamily="var(--font-mono)">!</text>
          <title>This contact is not used on any path</title>
        </g>
      );
    const c = item.c;
    return (
      <g
        key={`c-${c.elId}`}
        className="cursor-pointer"
        onMouseDown={(e) => { e.stopPropagation(); p.onXrefClick(c); }}
        role="button"
      >
        <title>{`${entry.tag} ${c.sub} is on path ${c.path}. Click to jump to it.`}</title>
        <rect x={cx - 16} y={cy - 9} width={32} height={18} rx={9} fill="var(--ok-soft)" stroke="var(--ok)" strokeWidth={1} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ok)" fontFamily="var(--font-mono)">{c.path}</text>
      </g>
    );
  };
  return (
    <g
      onMouseEnter={() => p.onXrefHover(entry.deviceId)}
      onMouseLeave={() => p.onXrefHover(null)}
    >
      <rect x={x} y={y} width={W} height={H} rx={4} fill="var(--surface)" stroke="var(--border-strong)" />
      <rect x={x} y={y} width={W} height={22} rx={4} fill="var(--surface-sunken)" />
      <rect x={x} y={y + 12} width={W} height={10} fill="var(--surface-sunken)" />
      <text x={x + 8} y={y + 15} fontSize={12} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-mono)">{entry.tag.split('/')[0]}</text>
      <text x={x + W - 8} y={y + 15} textAnchor="end" fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">contacts</text>
      <line x1={x + W / 2} y1={y + 22} x2={x + W / 2} y2={y + H} stroke="var(--border)" />
      <line x1={x} y1={y + 40} x2={x + W} y2={y + 40} stroke="var(--border)" />
      <text x={x + W / 4} y={y + 35} textAnchor="middle" fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">NO</text>
      <text x={x + (3 * W) / 4} y={y + 35} textAnchor="middle" fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">NC</text>
      {Array.from({ length: rows }, (_, i) => {
        const cy = y + 40 + 11 + i * 22 + 3;
        return (
          <React.Fragment key={i}>
            {cell(no[i], x + W / 4, cy)}
            {cell(nc[i], x + (3 * W) / 4, cy)}
          </React.Fragment>
        );
      })}
    </g>
  );
}

export const LadderVertical: React.FC<LadderVerticalProps> = (props) => {
  const { networks, zoom, pan } = props;
  const localSvgRef = useRef<SVGSVGElement | null>(null);
  const svgRef = props.svgRef ?? localSvgRef;

  const layout = useMemo(() => {
    const info = networks.map((net) => {
      const trunkCols = Math.max(1, measure(net.pre).h);
      const trunkRows = measure(net.pre).w;
      const branches = net.branches.map((br) => {
        const restCols = Math.max(1, measure(br.rest).h);
        const restRows = measure(br.rest).w;
        const outs = br.outputs.map((o) => ({ o, cols: Math.max(1, measure(o.post).h), rows: measure(o.post).w }));
        const outCols = outs.reduce((a, b) => a + b.cols, 0);
        const cols = Math.max(restCols, outCols, 1);
        const rows = restRows + 1 + Math.max(0, ...outs.map((x) => x.rows));
        return { br, restRows, outs, outCols, cols, rows };
      });
      const sumCols = branches.reduce((a, b) => a + b.cols, 0);
      const cols = Math.max(trunkCols, sumCols, 1);
      const rows = trunkRows + Math.max(...branches.map((b) => b.rows));
      return { net, trunkRows, branches, sumCols, cols, rows, outputCount: net.outputs.length };
    });
    const maxRows = Math.max(2, ...info.map((i) => i.rows));
    let x = LEFT;
    const placed = info.map((i) => {
      const x0 = x;
      x += i.cols * COLW + GAP;
      return { ...i, x0 };
    });
    return { placed, maxRows, width: x + 24 };
  }, [networks]);

  const railY = TOP_Y + layout.maxRows * ROWH + XREF_H;
  const height = railY + 56;

  const ctxParts: React.ReactNode[] = [];
  const pos = new Map<string, { x: number; y: number }>();
  layout.placed.forEach((n, netIndex) => {
    const ctx: Ctx = { parts: ctxParts, x0: n.x0, isClosed: props.isClosed, props, pos, keyPrefix: n.net.id };
    const id = n.net.id;
    const trunkX = colX(ctx, n.cols / 2);
    // the shared trunk, centred over the network
    const trunk = drawNode(ctx, n.net.pre, 0, n.cols, 0, props.railsLive, `${id}-pre`);
    const trunkOut = n.trunkRows === 0 ? props.railsLive : trunk.out;
    dot(ctx, `${id}-rail-dot`, trunkX, TOP_Y, props.railsLive);

    let sb = (n.cols - n.sumCols) / 2;
    const branchCentres = n.branches.map((b) => {
      const c = colX(ctx, sb + b.cols / 2);
      sb += b.cols;
      return c;
    });
    if (n.branches.length > 1) {
      const yBar = edgeY(n.trunkRows);
      wire(ctx, `${id}-split`, Math.min(...branchCentres, trunkX), yBar, Math.max(...branchCentres, trunkX), yBar, trunkOut);
      dot(ctx, `${id}-split-dot`, trunkX, yBar, trunkOut);
      branchCentres.forEach((cx2, i) => dot(ctx, `${id}-split-${i}`, cx2, yBar, trunkOut));
    }

    sb = (n.cols - n.sumCols) / 2;
    n.branches.forEach((b, bi) => {
      const xb = branchCentres[bi];
      // contacts only this branch has
      const rest = drawNode(ctx, b.br.rest, sb, b.cols, n.trunkRows, trunkOut, `${id}-b${bi}`);
      const restOut = b.restRows === 0 ? trunkOut : rest.out;
      const row0 = n.trunkRows + b.restRows;
      let off = sb + (b.cols - b.outCols) / 2;
      const centres = b.outs.map((x) => {
        const c = colX(ctx, off + x.cols / 2);
        off += x.cols;
        return c;
      });
      if (b.outs.length > 1) {
        const yBar = edgeY(row0);
        wire(ctx, `${id}-b${bi}-osplit`, Math.min(...centres, xb), yBar, Math.max(...centres, xb), yBar, restOut);
        dot(ctx, `${id}-b${bi}-osplit-dot`, xb, yBar, restOut);
        centres.forEach((cx2, i) => dot(ctx, `${id}-b${bi}-osplit-${i}`, cx2, yBar, restOut));
      }
      off = sb + (b.cols - b.outCols) / 2;
      b.outs.forEach((x, i) => {
        const cx2 = centres[i];
        const hx = n.outputCount === 1 ? n.x0 : colX(ctx, off);
        const hw = n.outputCount === 1 ? n.cols * COLW : x.cols * COLW;
        const sel = props.selectedPathKey === x.o.key;
        ctxParts.push(
          <g key={`${x.o.key}-hdr`} className="cursor-pointer" onMouseDown={() => props.onSelectPath?.(x.o)}>
            <rect x={hx + 4} y={HDR_Y} width={hw - 8} height={HDR_H} rx={8} fill="var(--surface)" stroke={sel ? 'var(--probe)' : 'var(--border)'} strokeWidth={sel ? 2 : 1} />
            <rect x={hx + 14} y={HDR_Y + 10} width={24} height={24} rx={12} fill={n.outputCount > 1 ? 'var(--surface-sunken)' : 'var(--brand-soft)'} />
            <text x={hx + 26} y={HDR_Y + 27} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-mono)">{x.o.path}</text>
            <text x={hx + 46} y={HDR_Y + 20} fontSize={12} fontWeight={600} fill="var(--ink)">{x.o.label}</text>
            <text x={hx + 46} y={HDR_Y + 35} fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">
              {n.outputCount > 1 ? `network ${netIndex + 1}` : x.o.output?.sub || ''}
            </text>
          </g>
        );
        const energized = props.loadEnergized(x.o.output, restOut) && props.railsLive;
        drawOutput(ctx, x.o, cx2, row0, restOut, energized);
        const post = drawNode(ctx, x.o.post, off, x.cols, row0 + 1, energized, `${x.o.key}-post`);
        const endRow = row0 + 1 + post.rows;
        const tailOn = x.rows === 0 ? energized : post.out;
        wire(ctx, `${x.o.key}-tail`, cx2, edgeY(endRow), cx2, railY, tailOn);
        dot(ctx, `${x.o.key}-tail-dot`, cx2, railY, tailOn);
        // cross-reference table under the coil, to the right of its wire
        ctxParts.push(<XrefTable key={`${x.o.key}-xref`} ctx={ctx} out={x.o} x={cx2 + 14} y={railY - XREF_H + 14} />);
        off += x.cols;
      });
      sb += b.cols;
    });
  });

  // scroll / pan to flash a contact after a cross-reference click
  const focusId = props.focusEl?.id;
  const focusNonce = props.focusEl?.nonce;
  useEffect(() => {
    props.onReportBounds?.({ minX: 0, minY: 0, maxX: layout.width, maxY: height });
  }, [layout.width, height, props.onReportBounds]);

  useEffect(() => {
    if (!focusId) return;
    const p = pos.get(focusId);
    if (!p) return;
    if (props.onCenterPoint) {
      props.onCenterPoint(p.x, p.y);
      return;
    }
    const host = svgRef.current?.parentElement;
    if (!host) return;
    host.scrollTo({ left: Math.max(0, p.x * zoom - host.clientWidth / 2), top: Math.max(0, p.y * zoom - host.clientHeight / 2), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusNonce]);

  if (pan) {
    return (
      <svg
        ref={svgRef as React.RefObject<SVGSVGElement>}
        className={`w-full h-full touch-none ${props.cursorClass ?? 'cursor-default'}`}
        onMouseDown={props.onCanvasMouseDown}
        onMouseMove={props.onCanvasMouseMove}
        onMouseUp={props.onCanvasMouseUp}
        onMouseLeave={props.onCanvasMouseUp}
        onWheel={props.onCanvasWheel}
        onTouchStart={props.onCanvasTouchStart}
        onTouchMove={props.onCanvasTouchMove}
        onTouchEnd={props.onCanvasTouchEnd}
        onTouchCancel={props.onCanvasTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
        role="img"
        aria-label="Control ladder, vertical current paths"
      >
        <defs>
          <pattern id="ladderGridV" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="var(--border-strong)" opacity="0.5" />
          </pattern>
        </defs>
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          <rect x={-2000} y={-2000} width={6000} height={6000} fill="url(#ladderGridV)" />
          <line x1={LEFT - 20} y1={TOP_Y} x2={layout.width - 20} y2={TOP_Y} stroke={props.railsLive ? 'var(--ok)' : 'var(--ink)'} strokeWidth={3.5} strokeLinecap="round" />
          <line x1={LEFT - 20} y1={railY} x2={layout.width - 20} y2={railY} stroke="var(--ink)" strokeWidth={3.5} strokeLinecap="round" />
          <text x={LEFT - 20} y={TOP_Y - 10} fontSize={12} fontWeight={700} fill={props.railsLive ? 'var(--ok)' : 'var(--ink)'} fontFamily="var(--font-mono)">{props.railTopLabel}</text>
          <text x={LEFT - 20} y={railY + 22} fontSize={12} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-mono)">{props.railBottomLabel}</text>
          {ctxParts}
        </g>
      </svg>
    );
  }

  return (
    <svg ref={svgRef as React.RefObject<SVGSVGElement>} width={layout.width * zoom} height={height * zoom} viewBox={`0 0 ${layout.width} ${height}`} className="block" role="img" aria-label="Control ladder, vertical current paths">
      <defs>
        <pattern id="ladderGridV" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="var(--border-strong)" opacity="0.5" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={layout.width} height={height} fill="url(#ladderGridV)" />
      <line x1={LEFT - 20} y1={TOP_Y} x2={layout.width - 20} y2={TOP_Y} stroke={props.railsLive ? 'var(--ok)' : 'var(--ink)'} strokeWidth={3.5} strokeLinecap="round" />
      <line x1={LEFT - 20} y1={railY} x2={layout.width - 20} y2={railY} stroke="var(--ink)" strokeWidth={3.5} strokeLinecap="round" />
      <text x={LEFT - 20} y={TOP_Y - 10} fontSize={12} fontWeight={700} fill={props.railsLive ? 'var(--ok)' : 'var(--ink)'} fontFamily="var(--font-mono)">{props.railTopLabel}</text>
      <text x={LEFT - 20} y={railY + 22} fontSize={12} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-mono)">{props.railBottomLabel}</text>
      {ctxParts}
    </svg>
  );
};
