import React, { useMemo, useState } from 'react';
import { ElectricalDevice, ElectricalWire } from '../../types/electrical';
import { SolvedCircuit } from '../../core/circuitSolver';
import { buildSld, SldEdge, SldNode } from '../../core/sldLayout';
import { ZoomIn, ZoomOut, Maximize2, LayoutGrid } from 'lucide-react';

/**
 * Single-line diagram: a tiered, power-only view built from the wiring topology (see core/sldLayout.ts).
 * Supplies sit on top, loads at the bottom; each protective device shows its rating, each link its cable and
 * live current, and every tier shows the prospective fault current. The old workbench-mirroring schematic stays
 * available under "Classic".
 */

interface SingleLineCanvasProps {
  devices: ElectricalDevice[];
  wires: ElectricalWire[];
  solved: SolvedCircuit;
  /** Prospective fault current at each device input, A (only when the fault-level overlay is on) */
  faultByDevice?: Record<string, number>;
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  /** Open the control ladder for a motor feeder */
  onOpenLadder?: (deviceId: string) => void;
  hasControl: boolean;
  title: string;
  standard: string;
  voltage: number;
  frequency: number;
  /** The previous schematic, shown when the user picks "Classic" */
  classic: React.ReactNode;
}

const toneOf = (s: SldNode['state']) => (s === 'live' ? 'var(--ok)' : s === 'tripped' ? 'var(--danger)' : 'var(--ink-muted)');
const swOf = (s: SldNode['state']) => (s === 'off' ? 1.25 : 2.5);
const kA = (a: number) => `${(a / 1000).toFixed(a >= 10000 ? 1 : 2)} kA`;
const kW = (w: number) => (w >= 1000 ? `${(w / 1000).toFixed(w >= 10000 ? 0 : 1)} kW` : `${Math.round(w)} W`);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const HALF = 28;

function Symbol({ n }: { n: SldNode }) {
  const c = toneOf(n.state);
  const w = swOf(n.state);
  const common = { fill: 'none', stroke: c, strokeWidth: w, strokeLinecap: 'round' as const };
  switch (n.symbol) {
    case 'source3p':
    case 'grid':
      return (
        <g>
          <circle r={16} fill="var(--surface)" stroke={c} strokeWidth={w} />
          <path d="M-9 0 q4.5 -9 9 0 t9 0" {...common} />
        </g>
      );
    case 'generator':
      return (
        <g>
          <circle r={16} fill="var(--surface)" stroke={c} strokeWidth={w} />
          <text y={5} textAnchor="middle" fontSize={14} fontWeight={700} fill={c} fontFamily="var(--font-mono)">G</text>
        </g>
      );
    case 'motor':
      return (
        <g>
          <circle r={19} fill={n.state === 'live' ? 'var(--ok-soft)' : 'var(--surface)'} stroke={c} strokeWidth={w} />
          <text y={-1} textAnchor="middle" fontSize={14} fontWeight={700} fill={c} fontFamily="var(--font-mono)">M</text>
          <text y={13} textAnchor="middle" fontSize={11} fontWeight={600} fill={c} fontFamily="var(--font-mono)">3~</text>
        </g>
      );
    case 'transformer':
      return (
        <g>
          <circle cy={-9} r={13} fill="var(--surface)" stroke={c} strokeWidth={w} />
          <circle cy={9} r={13} fill="var(--surface)" stroke={c} strokeWidth={w} />
        </g>
      );
    case 'meter':
      return (
        <g>
          <circle r={16} fill="var(--surface)" stroke={c} strokeWidth={w} />
          <text y={4} textAnchor="middle" fontSize={11} fontWeight={600} fill={c} fontFamily="var(--font-mono)">kWh</text>
        </g>
      );
    case 'light':
      return (
        <g>
          <circle r={12} fill="var(--surface)" stroke={c} strokeWidth={w} />
          <path d="M-8.5 -8.5 L8.5 8.5 M8.5 -8.5 L-8.5 8.5" {...common} />
        </g>
      );
    case 'breaker':
    case 'rcd':
    case 'switch':
    case 'spd':
    case 'contactor': {
      const open = n.state === 'tripped';
      return (
        <g>
          <path d={open ? 'M0 14 L11 -9' : 'M0 14 V-14'} {...common} />
          <circle cy={-14} r={2} fill={c} />
          <circle cy={14} r={2} fill={c} />
          {(n.symbol === 'breaker' || n.symbol === 'rcd') && <path d="M-5 -21 L5 -11 M5 -21 L-5 -11" {...common} />}
          {n.symbol === 'rcd' && <circle cx={14} cy={0} r={5} fill="none" stroke={c} strokeWidth={1.25} />}
        </g>
      );
    }
    case 'fuse':
      return <rect x={-6} y={-16} width={12} height={32} rx={2} fill="var(--surface)" stroke={c} strokeWidth={w} />;
    case 'tor':
      return (
        <g>
          <rect x={-12} y={-14} width={24} height={28} rx={2} fill="var(--surface)" stroke={c} strokeWidth={w} />
          <path d="M-6 6 L0 -6 L6 6" {...common} strokeWidth={1.5} />
        </g>
      );
    case 'junction':
    case 'splice':
      return <circle r={5} fill={c} />;
    default:
      return (
        <g>
          <rect x={-22} y={-15} width={44} height={30} rx={6} fill="var(--surface)" stroke={c} strokeWidth={w} />
          <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill={c} fontFamily="var(--font-mono)">{n.symbol.slice(0, 4).toUpperCase()}</text>
        </g>
      );
  }
}

export const SingleLineCanvas: React.FC<SingleLineCanvasProps> = ({
  devices,
  wires,
  solved,
  faultByDevice,
  selectedDeviceId,
  onSelectDevice,
  onOpenLadder,
  hasControl,
  title,
  standard,
  voltage,
  frequency,
  classic,
}) => {
  const [zoom, setZoom] = useState(1);
  const [useClassic, setUseClassic] = useState(false);
  const sld = useMemo(() => buildSld(devices, wires, solved, faultByDevice || {}), [devices, wires, solved, faultByDevice]);
  const byId = useMemo(() => new Map(sld.nodes.map((n) => [n.id, n])), [sld]);

  if (useClassic) {
    return (
      <div className="relative flex-1 min-h-0 flex flex-col">
        <button
          onClick={() => setUseClassic(false)}
          className="absolute top-3 right-3 z-20 h-8 px-3 rounded-lg border border-border bg-surface text-xs font-bold hover:bg-surface-sunken shadow-sm"
        >
          Single-line view
        </button>
        {classic}
      </div>
    );
  }

  const attach = (n: SldNode, other: SldNode, side: 'top' | 'bottom') => {
    if (n.busWidth > 0) return { x: Math.min(Math.max(other.x, n.x - n.busWidth / 2), n.x + n.busWidth / 2), y: n.y };
    return { x: n.x, y: n.y + (side === 'top' ? -HALF : HALF) };
  };

  const edgePath = (e: SldEdge) => {
    const a = byId.get(e.fromId)!;
    const b = byId.get(e.toId)!;
    const p1 = attach(a, b, 'bottom');
    const p2 = attach(b, a, 'top');
    const midY = Math.round((p1.y + p2.y) / 2);
    const d = p1.x === p2.x ? `M ${p1.x} ${p1.y} V ${p2.y}` : `M ${p1.x} ${p1.y} V ${midY} H ${p2.x} V ${p2.y}`;
    // annotations sit on the last vertical stretch, clear of the horizontal bar
    const labelY = p1.x === p2.x ? midY : Math.round((midY + p2.y) / 2);
    return { d, p1, p2, midY: labelY };
  };

  const energized = sld.nodes.filter((n) => n.state === 'live').length;
  const tripped = sld.nodes.filter((n) => n.state === 'tripped').length;
  const totalW = sld.nodes.filter((n) => n.watts).reduce((a, n) => a + (n.watts || 0), 0);
  const W = Math.max(sld.width, 900);
  const H = Math.max(sld.height, 560);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-canvas overflow-hidden select-none">
      <div className="shrink-0 border-b border-border bg-surface px-3 py-2 flex flex-wrap items-center gap-2">
        <div className="leading-tight mr-2">
          <div className="text-[11px] font-black uppercase tracking-wider text-ink">Single-line diagram</div>
          <div className="text-[11px] font-mono text-ink-muted">
            {sld.nodes.length} devices · {energized} energized{tripped ? ` · ${tripped} tripped` : ''}{totalW ? ` · ${kW(totalW)} connected` : ''}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} className="w-8 h-8 rounded-md border border-border bg-surface flex items-center justify-center hover:bg-surface-sunken" title="Zoom out" aria-label="Zoom out">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setZoom(1)} className="w-8 h-8 rounded-md border border-border bg-surface flex items-center justify-center hover:bg-surface-sunken" title="Reset zoom" aria-label="Reset zoom">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setZoom((z) => Math.min(1.8, z + 0.1))} className="w-8 h-8 rounded-md border border-border bg-surface flex items-center justify-center hover:bg-surface-sunken" title="Zoom in" aria-label="Zoom in">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setUseClassic(true)} className="h-8 px-2.5 rounded-md border border-border bg-surface text-[11px] font-bold flex items-center gap-1 hover:bg-surface-sunken" title="The previous schematic, laid out like the workbench">
            <LayoutGrid className="w-3.5 h-3.5" /> Classic
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto" onMouseDown={() => onSelectDevice(null)}>
        {sld.nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-sm text-center bg-surface border border-border rounded-lg p-6 shadow-sm">
              <div className="text-sm font-bold text-ink mb-1">No power circuit to draw yet</div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Wire a supply (3-phase source, generator or PV) through protective devices to a load and the single-line diagram builds itself.
              </p>
            </div>
          </div>
        ) : (
          <svg width={W * zoom} height={H * zoom} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Single-line diagram">
            {sld.edges.map((e) => {
              const { d, midY, p2 } = edgePath(e);
              const on = e.live;
              return (
                <g key={e.id}>
                  <path d={d} fill="none" stroke={on ? 'var(--ok)' : 'var(--ink-muted)'} strokeWidth={on ? 2.5 : 1.25} strokeLinejoin="round" className={on ? 'wire-flow' : undefined} />
                  <text x={p2.x + 10} y={midY - 2} fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">{e.cable}</text>
                  {on && e.amps > 0.05 && (
                    <g>
                      <rect x={p2.x + 10} y={midY + 3} width={58} height={18} rx={9} fill="var(--ok-soft)" stroke="var(--ok)" strokeWidth={1} />
                      <text x={p2.x + 39} y={midY + 16} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ok)" fontFamily="var(--font-mono)">{e.amps.toFixed(1)} A</text>
                    </g>
                  )}
                  {e.dropPct > 3 && (
                    <text x={p2.x + 10} y={midY + 36} fontSize={11} fontWeight={700} fill="var(--warning)" fontFamily="var(--font-mono)">ΔV {e.dropPct.toFixed(1)} % (over 3 %)</text>
                  )}
                </g>
              );
            })}

            {sld.nodes.map((n) => {
              const sel = selectedDeviceId === n.id;
              const isBus = n.busWidth > 0;
              const tone = toneOf(n.state);
              return (
                <g
                  key={n.id}
                  className="cursor-pointer"
                  onMouseDown={(ev) => {
                    ev.stopPropagation();
                    onSelectDevice(n.id);
                  }}
                >
                  {isBus ? (
                    <>
                      <line x1={n.x - n.busWidth / 2} y1={n.y} x2={n.x + n.busWidth / 2} y2={n.y} stroke={tone} strokeWidth={7} strokeLinecap="round" />
                      <text x={n.x - n.busWidth / 2} y={n.y - 14} fontSize={12} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-mono)">{clip(n.label, 30)}</text>
                    </>
                  ) : (
                    <>
                      <rect x={n.x - 70} y={n.y - 36} width={140} height={72} rx={8} fill="transparent" />
                      {sel && <rect x={n.x - 34} y={n.y - 34} width={68} height={68} rx={10} fill="none" stroke="var(--probe)" strokeWidth={2} />}
                      <g transform={`translate(${n.x},${n.y})`}>
                        <Symbol n={n} />
                      </g>
                      {n.state === 'tripped' && (
                        <g>
                          <circle cx={n.x - 24} cy={n.y - 24} r={9} fill="var(--danger-soft)" stroke="var(--danger)" strokeWidth={1.5} />
                          <path d={`M ${n.x - 28} ${n.y - 28} l8 8 M ${n.x - 20} ${n.y - 28} l-8 8`} stroke="var(--danger)" strokeWidth={2} strokeLinecap="round" />
                        </g>
                      )}
                      <text x={n.x + 30} y={n.y - 3} fontSize={12} fontWeight={700} fill={n.state === 'tripped' ? 'var(--danger)' : 'var(--ink)'} fontFamily="var(--font-mono)">{clip(n.label, 22)}</text>
                      {n.rating && <text x={n.x + 30} y={n.y + 12} fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">{n.rating}</text>}
                      {n.watts ? <text x={n.x + 30} y={n.y + 27} fontSize={11} fill="var(--ink-muted)" fontFamily="var(--font-mono)">{kW(n.watts)}</text> : null}
                    </>
                  )}
                  {n.faultAmps ? (
                    <g>
                      <rect x={isBus ? n.x - n.busWidth / 2 : n.x - 30} y={isBus ? n.y + 10 : n.y + 40} width={92} height={20} rx={10} fill="var(--surface)" stroke="var(--border-strong)" />
                      <path d={`M ${(isBus ? n.x - n.busWidth / 2 : n.x - 30) + 12} ${(isBus ? n.y + 10 : n.y + 40) + 4} l-4 7 h5 l-3 6 l8 -9 h-5 l3 -4 Z`} fill="var(--ink)" />
                      <text x={(isBus ? n.x - n.busWidth / 2 : n.x - 30) + 22} y={(isBus ? n.y + 10 : n.y + 40) + 14} fontSize={11} fontWeight={600} fill="var(--ink)" fontFamily="var(--font-mono)">{kA(n.faultAmps)}</text>
                    </g>
                  ) : null}
                  {n.symbol === 'motor' && hasControl && onOpenLadder && (
                    <g
                      onMouseDown={(ev) => {
                        ev.stopPropagation();
                        onOpenLadder(n.id);
                      }}
                    >
                      <title>Open the control ladder</title>
                      <rect x={n.x - 58} y={n.y + 62} width={116} height={24} rx={12} fill="var(--brand-soft)" stroke="var(--brand)" />
                      <text x={n.x} y={n.y + 78} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--brand-ink)" fontFamily="var(--font-mono)">Control ladder ▸</text>
                    </g>
                  )}
                </g>
              );
            })}

            {sld.unconnected.length > 0 && (
              <g>
                <text x={40} y={sld.unconnected[0].y - 40} fontSize={11} fontWeight={700} fill="var(--ink-muted)" fontFamily="var(--font-mono)" letterSpacing="0.06em">NOT CONNECTED TO A SUPPLY</text>
                {sld.unconnected.map((n) => (
                  <g key={n.id} className="cursor-pointer" onMouseDown={(ev) => { ev.stopPropagation(); onSelectDevice(n.id); }}>
                    <g transform={`translate(${n.x},${n.y})`}><Symbol n={n} /></g>
                    <text x={n.x + 30} y={n.y + 4} fontSize={12} fill="var(--ink-muted)" fontFamily="var(--font-mono)">{clip(n.label, 22)}</text>
                  </g>
                ))}
              </g>
            )}
          </svg>
        )}
      </div>

      <div className="absolute right-4 bottom-4 bg-surface border border-ink rounded-md text-[11px] font-mono w-[300px] shadow-sm" aria-label="Title block">
        <div className="flex justify-between px-2.5 py-1.5 border-b border-border">
          <b className="text-ink">{clip(title || 'Untitled', 28)} · SLD</b>
          <span className="text-ink-muted">Sheet 1 / 1</span>
        </div>
        {[
          ['Standard', standard === 'PEC' ? 'PEC 2017' : 'IEC 60364'],
          ['Voltage / freq', `${voltage} V · ${frequency} Hz`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between px-2.5 py-1 border-b border-border last:border-0">
            <span className="text-ink-muted">{k}</span>
            <b className="text-ink">{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
};
