import React from 'react';
import { ElectricalDevice } from '../../types/electrical';
import type { LadderElement, LadderElementKind, LadderRung } from '../../types/ladder';
import {
  ALL_COUNTERS, ALL_INPUTS, ALL_MEMORY_BITS, ALL_OUTPUTS, ALL_TIMERS, ALL_WORDS, addressKind, emptyRuntime, ioMap, validateProgram,
  type PlcForces, type PlcProgram, type PlcRuntime,
} from '../../core/plcEngine';
import { PLC_PRESETS, blankProgram } from '../../data/plcPresets';
import {
  addParallel, addRung, appendContact, cloneRung, findElement, isOutputKind, makeElement, moveRung, pasteRung, removeElement, removeRung, setOutput,
  updateElement, updateRung,
} from '../../core/plcEdit';
import { Copy, Eye, Pencil, Play, Plus, Scissors, Trash2, Undo2, ClipboardPaste, ArrowUp, ArrowDown } from 'lucide-react';

interface PlcEditorProps {
  devices: ElectricalDevice[];
  selectedDeviceId: string | null;
  isSimulating: boolean;
  /** Merge a state patch into a device (programs, run mode, forces) */
  onPatchDeviceState: (deviceId: string, patch: Record<string, any>) => void;
}

const PALETTE: { title: string; kinds: { kind: LadderElementKind; label: string; hint: string }[] }[] = [
  {
    title: 'Contacts',
    kinds: [
      { kind: 'NO', label: '┤ ├', hint: 'Normally open contact' },
      { kind: 'NC', label: '┤/├', hint: 'Normally closed contact' },
      { kind: 'PEDGE', label: '┤P├', hint: 'Positive edge (one scan on the rise)' },
      { kind: 'NEDGE', label: '┤N├', hint: 'Negative edge (one scan on the fall)' },
      { kind: 'EQ', label: 'A=B', hint: 'Compare equal' },
      { kind: 'GT', label: 'A>B', hint: 'Compare greater than' },
      { kind: 'LT', label: 'A<B', hint: 'Compare less than' },
    ],
  },
  {
    title: 'Coils',
    kinds: [
      { kind: 'COIL', label: '( )', hint: 'Output coil' },
      { kind: 'NCOIL', label: '(/)', hint: 'Negated output coil' },
      { kind: 'SET', label: '(S)', hint: 'Set (latch on)' },
      { kind: 'RESET', label: '(R)', hint: 'Reset (latch off)' },
    ],
  },
  {
    title: 'Timers, counters, math',
    kinds: [
      { kind: 'TON', label: 'TON', hint: 'On-delay timer' },
      { kind: 'TOF', label: 'TOF', hint: 'Off-delay timer' },
      { kind: 'TP', label: 'TP', hint: 'Pulse timer' },
      { kind: 'CTU', label: 'CTU', hint: 'Count up' },
      { kind: 'CTD', label: 'CTD', hint: 'Count down' },
      { kind: 'MOV', label: 'MOV', hint: 'Move a value to a memory word' },
      { kind: 'ADD', label: 'ADD', hint: 'Add two values into a memory word' },
    ],
  },
];

const symbolLabel = (p: PlcProgram, a?: string) => (a && p.symbols[a]) || '';
const isCompare = (k: string) => k === 'EQ' || k === 'GT' || k === 'LT';
const isTimer = (k: string) => k === 'TON' || k === 'TOF' || k === 'TP';
const isCounter = (k: string) => k === 'CTU' || k === 'CTD';

function addressOptions(kind: LadderElementKind): string[] {
  if (['NO', 'NC', 'PEDGE', 'NEDGE'].includes(kind)) return [...ALL_INPUTS, ...ALL_OUTPUTS, ...ALL_MEMORY_BITS, ...ALL_TIMERS, ...ALL_COUNTERS];
  if (['COIL', 'NCOIL', 'SET', 'RESET', 'LAMP'].includes(kind)) return [...ALL_OUTPUTS, ...ALL_MEMORY_BITS];
  if (isTimer(kind)) return ALL_TIMERS;
  if (isCounter(kind)) return ALL_COUNTERS;
  return ALL_WORDS;
}

/**
 * PLC program editor: palette, rungs, element properties, symbol table, validation, and a Monitor mode that shows the
 * live scan (power flow, timer and counter values) and lets you force inputs and outputs.
 */
export const PlcEditor: React.FC<PlcEditorProps> = ({ devices, selectedDeviceId, isSimulating, onPatchDeviceState }) => {
  const plcs = devices.filter((d) => d.type === 'plc_micro_controller' || d.type === 'plc_24vdc_16io' || d.type === 'plc_24vdc_32io');
  const [plcId, setPlcId] = React.useState<string | null>(null);
  const plc = plcs.find((d) => d.id === (plcId ?? selectedDeviceId)) || plcs[0] || null;
  const [mode, setMode] = React.useState<'edit' | 'monitor'>('edit');
  const [selectedEl, setSelectedEl] = React.useState<string | null>(null);
  const [selectedRung, setSelectedRung] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<PlcProgram[]>([]);
  const [clipboard, setClipboard] = React.useState<LadderRung | null>(null);
  const [dragKind, setDragKind] = React.useState<LadderElementKind | null>(null);

  if (!plc) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-muted p-8 text-center">
        <div>
          <div className="text-ink font-semibold mb-1">No PLC on the canvas</div>
          Place a Micro PLC or a 24 V DC PLC from the library to program it here.
        </div>
      </div>
    );
  }

  const stored = plc.state.plcProgram as PlcProgram | undefined;
  const program: PlcProgram = stored || blankProgram();
  const userMode = plc.state.program === 'user';
  const runtime: PlcRuntime = (userMode && (plc.state.plcRuntime as PlcRuntime | undefined)) || emptyRuntime();
  const forces: PlcForces = (plc.state.plcForces as PlcForces | undefined) || { inputs: {}, outputs: {} };
  const issues = validateProgram(program);
  const map = ioMap(plc.type);
  const monitoring = mode === 'monitor';

  const commit = (next: PlcProgram) => {
    setHistory((h) => [...h.slice(-30), program]);
    onPatchDeviceState(plc.id, { plcProgram: next, program: 'user' });
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    onPatchDeviceState(plc.id, { plcProgram: prev, program: 'user' });
  };

  const selected = selectedEl ? findElement(program, selectedEl) : null;
  const rung = program.rungs.find((r) => r.id === (selectedRung ?? selected?.rungId));

  const inRung = (rungId: string, e: React.DragEvent, zone: 'series' | 'output') => {
    e.preventDefault();
    const kind = (e.dataTransfer.getData('text/plc-kind') || dragKind) as LadderElementKind | null;
    setDragKind(null);
    if (!kind) return;
    const el = makeElement(kind);
    if (zone === 'output' || isOutputKind(kind)) commit(setOutput(program, rungId, el));
    else commit(appendContact(program, rungId, el));
    setSelectedEl(el.id);
  };

  const elBox = (el: LadderElement, rungPower: boolean) => {
    const live = monitoring && userMode && !!runtime.flow[el.id];
    const out = isOutputKind(el.kind);
    const sym = symbolLabel(program, el.address);
    const t = el.address ? runtime.timers[el.address] : undefined;
    const c = el.address ? runtime.counters[el.address] : undefined;
    const bitOn = el.address && addressKind(el.address) !== 'MW' ? (addressKind(el.address) === 'T' ? !!runtime.timers[el.address]?.q : addressKind(el.address) === 'C' ? !!runtime.counters[el.address]?.q : !!runtime.bits[el.address]) : false;
    const selectedNow = selectedEl === el.id;
    const forcedVal = el.address ? (el.address in forces.inputs ? forces.inputs[el.address] : el.address in forces.outputs ? forces.outputs[el.address] : undefined) : undefined;
    let body: React.ReactNode;
    if (isTimer(el.kind) || isCounter(el.kind) || el.kind === 'MOV' || el.kind === 'ADD') {
      body = (
        <div className="px-2 py-1 text-center">
          <div className="text-[11px] font-bold">{el.kind} {el.address}</div>
          <div className="text-[11px] opacity-80 font-mono">
            {isTimer(el.kind) && (monitoring && t ? `ET ${(t.acc / 1000).toFixed(1)} s · PT ${((el.preset || 0) / 1000).toFixed(1)} s` : `PT ${((el.preset || 0) / 1000).toFixed(1)} s`)}
            {isCounter(el.kind) && (monitoring && c ? `${c.acc} / ${el.preset}` : `PV ${el.preset}`)}
            {el.kind === 'MOV' && `${el.operandA} → ${el.address}`}
            {el.kind === 'ADD' && `${el.operandA} + ${el.operandB} → ${el.address}`}
          </div>
          {isTimer(el.kind) && monitoring && t && el.preset ? (
            <div className="mt-1 h-1.5 w-full rounded bg-surface-sunken overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={el.preset} aria-valuenow={Math.min(t.acc, el.preset)}>
              <div className="h-full bg-ok" style={{ width: `${Math.min(100, (t.acc / el.preset) * 100)}%` }} />
            </div>
          ) : null}
        </div>
      );
    } else if (isCompare(el.kind)) {
      body = (
        <div className="px-2 py-1 text-center text-[11px] font-mono font-bold">
          {String(el.operandA)} {el.kind === 'EQ' ? '=' : el.kind === 'GT' ? '>' : '<'} {String(el.operandB)}
        </div>
      );
    } else {
      const glyph = { NO: '┤ ├', NC: '┤/├', PEDGE: '┤P├', NEDGE: '┤N├', COIL: '( )', NCOIL: '(/)', SET: '(S)', RESET: '(R)', LAMP: '( )' }[el.kind as string] || el.kind;
      body = (
        <div className="px-2 py-1 text-center">
          <div className="text-sm font-mono font-bold leading-none">{glyph}</div>
          <div className="text-[11px] font-mono mt-0.5">{el.address}</div>
          {monitoring && el.address && addressKind(el.address) && addressKind(el.address) !== 'MW' && (
            <span className={`inline-block mt-0.5 min-w-[22px] rounded-full px-1 text-[11px] font-mono font-bold ${bitOn ? 'bg-ok-soft text-ok' : 'bg-surface-sunken text-ink-muted'}`}>{bitOn ? 1 : 0}</span>
          )}
        </div>
      );
    }
    const color = live || (monitoring && out && bitOn) ? 'bg-ok-soft border-ok text-ok' : 'bg-surface border-border-strong text-ink';
    return (
      <button
        key={el.id}
        draggable={false}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedEl(el.id);
          setSelectedRung(null);
        }}
        onDragOver={(e) => {
          if (dragKind && !isOutputKind(dragKind)) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const kind = (e.dataTransfer.getData('text/plc-kind') || dragKind) as LadderElementKind | null;
          setDragKind(null);
          if (!kind || isOutputKind(kind) || out) return;
          const ne = makeElement(kind);
          commit(addParallel(program, el.id, ne));
          setSelectedEl(ne.id);
        }}
        className={`relative min-w-[78px] rounded border-2 text-xs transition ${color} ${selectedNow ? 'ring-2 ring-probe' : ''} ${rungPower && !monitoring ? '' : ''}`}
        title={`${el.kind} ${el.address || ''}${sym ? ' · ' + sym : ''}${monitoring && addressKind(el.address) && addressKind(el.address) !== 'MW' ? (bitOn ? ' = 1' : ' = 0') : ''}`}
      >
        {body}
        {sym && <div className="text-[11px] px-1 pb-0.5 text-ink-muted truncate max-w-[110px]">{sym}</div>}
        {forcedVal !== undefined && (
          <span className="absolute -top-2 -right-2 rounded-full px-1.5 h-[18px] flex items-center text-[11px] font-bold font-mono" style={{ background: 'var(--warning-fill)', color: 'var(--ink)' }}>
            F {forcedVal ? 1 : 0}
          </span>
        )}
      </button>
    );
  };

  const rungView = (r: LadderRung, idx: number) => {
    const power = monitoring && userMode && !!runtime.rungPower[r.id];
    const sel = selectedRung === r.id || selected?.rungId === r.id;
    return (
      <div
        key={r.id}
        onClick={() => {
          setSelectedRung(r.id);
          setSelectedEl(null);
        }}
        className={`rounded-md border px-2 py-2 mb-2 ${sel ? 'border-probe bg-surface-sunken' : 'border-border bg-surface'}`}
      >
        <div className="flex items-center gap-2 mb-1 text-[11px] font-mono text-ink-muted">
          <span className="font-bold text-ink">{String(idx + 1).padStart(2, '0')}</span>
          <span>{r.label || ''}</span>
          {power && <span className="text-ok font-bold">● POWER</span>}
        </div>
        <div className="flex items-center overflow-x-auto pb-1">
          <div className={`w-1.5 self-stretch rounded ${power ? 'bg-ok' : 'bg-ink-muted/40'}`} />
          {r.blocks.map((b) => (
            <div key={b.id} className="flex items-center">
              <div className={`w-4 h-0.5 ${power ? 'bg-ok' : 'bg-ink-muted/50'}`} />
              <div className="flex flex-col gap-1 border-l-2 border-r-2 border-transparent">
                {b.branches.map((br, bi) => (
                  <div key={bi} className="flex items-center gap-1">
                    {br.map((e) => elBox(e, power))}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* drop zone: append a contact in series */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => inRung(r.id, e, 'series')}
            className={`mx-1 w-16 h-10 rounded border border-dashed text-[11px] flex items-center justify-center text-ink-muted ${dragKind && !isOutputKind(dragKind) ? 'border-probe text-probe' : 'border-border'}`}
            title="Drop a contact here to add it in series"
          >
            + contact
          </div>
          <div className={`flex-1 min-w-[16px] h-0.5 ${power ? 'bg-ok' : 'bg-ink-muted/50'}`} />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => inRung(r.id, e, 'output')}
            className={`rounded ${dragKind && isOutputKind(dragKind) ? 'ring-2 ring-probe' : ''}`}
          >
            {r.output ? elBox(r.output, power) : <div className="w-20 h-10 rounded border border-dashed border-danger/60 text-[11px] flex items-center justify-center text-danger">output?</div>}
          </div>
          <div className={`w-4 h-0.5 ${power ? 'bg-ok' : 'bg-ink-muted/50'}`} />
          <div className={`w-1.5 self-stretch rounded ${power ? 'bg-ok' : 'bg-ink-muted/40'}`} />
        </div>
      </div>
    );
  };

  const field = 'bg-surface border border-border rounded px-1.5 py-0.5 text-xs font-mono text-ink w-full';
  const btn = 'px-2 py-1 rounded border border-border bg-surface hover:bg-surface-hover text-[11px] font-semibold text-ink transition flex items-center gap-1 disabled:opacity-40';

  const patchEl = (patch: Partial<LadderElement>) => selected && commit(updateElement(program, selected.element.id, patch));
  const el = selected?.element;
  const numOrAddr = (v: string): string | number => (addressKind(v) ? v : Number.isFinite(Number(v)) && v.trim() !== '' ? Number(v) : v);

  const setForce = (kind: 'inputs' | 'outputs', addr: string, value: boolean | null) => {
    const next: PlcForces = { inputs: { ...forces.inputs }, outputs: { ...forces.outputs } };
    if (value === null) delete next[kind][addr];
    else next[kind][addr] = value;
    onPatchDeviceState(plc.id, { plcForces: next });
  };
  const forcedCount = Object.keys(forces.inputs).length + Object.keys(forces.outputs).length;

  const ioCard = (a: string, kind: 'inputs' | 'outputs') => {
    const forced = a in forces[kind];
    const on = !!runtime.bits[a];
    const sym = program.symbols[a];
    return (
      <button
        key={a}
        disabled={!monitoring}
        onClick={() => setForce(kind, a, forced ? (forces[kind][a] ? false : null) : true)}
        title={`${a}${sym ? ' ' + sym : ''}${monitoring ? '. Click to force on, again to force off, again to release.' : '. Switch to Monitor to force.'}`}
        className="shrink-0 w-[136px] h-[52px] rounded-lg border px-2.5 flex items-center gap-2 text-left disabled:cursor-default"
        style={{ background: 'var(--console-raised)', borderColor: forced ? 'var(--warning-fill)' : 'var(--console-line)', color: 'var(--console-ink)' }}
      >
        {kind === 'inputs' ? (
          <span className="w-9 h-5 rounded-full relative shrink-0" style={{ background: on ? 'var(--console-readout)' : '#3a424c' }} aria-hidden="true">
            <span className="absolute top-0.5 w-4 h-4 rounded-full" style={{ left: on ? 18 : 2, background: on ? '#14181d' : '#fff' }} />
          </span>
        ) : (
          <span
            className="w-5 h-5 rounded-full shrink-0 border-2"
            style={{ background: on ? 'var(--console-readout)' : 'transparent', borderColor: on ? 'var(--console-readout)' : '#4a525c', boxShadow: on ? '0 0 0 3px rgba(86,211,220,.25)' : undefined }}
            aria-hidden="true"
          />
        )}
        <span className="min-w-0">
          <b className="block text-xs font-mono">{a}</b>
          <span className="block text-[11px] font-mono truncate" style={{ color: 'var(--console-muted)' }}>{sym || '\u00a0'}</span>
        </span>
        {forced && (
          <span className="ml-auto rounded-full px-1.5 h-[18px] flex items-center text-[11px] font-bold font-mono" style={{ background: 'var(--warning-fill)', color: 'var(--ink)' }}>
            F {forces[kind][a] ? 1 : 0}
          </span>
        )}
      </button>
    );
  };

  // Symbol table: every mapped I/O address plus everything the program uses or names
  const usedAddresses = new Set<string>(Object.keys(program.symbols));
  for (const r of program.rungs) {
    for (const b of r.blocks) for (const br of b.branches) for (const e of br) if (e.address) usedAddresses.add(e.address);
    if (r.output?.address) usedAddresses.add(r.output.address);
  }
  const symbolRows = [
    ...ALL_INPUTS.filter((a) => map.inputs[a]),
    ...ALL_OUTPUTS.filter((a) => map.outputs[a]),
    ...[...usedAddresses].filter((a) => addressKind(a) && !['I', 'Q'].includes(addressKind(a) as string)).sort(),
  ];
  const symbolValue = (a: string): { text: string; on: boolean } => {
    const k = addressKind(a);
    if (k === 'T') return { text: `${((runtime.timers[a]?.acc ?? 0) / 1000).toFixed(1)} s`, on: !!runtime.timers[a]?.q };
    if (k === 'C') return { text: String(runtime.counters[a]?.acc ?? 0), on: !!runtime.counters[a]?.q };
    if (k === 'MW') return { text: String(runtime.words[a] ?? 0), on: false };
    return { text: runtime.bits[a] ? '1' : '0', on: !!runtime.bits[a] };
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-canvas text-ink">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-surface">
        <select value={plc.id} onChange={(e) => setPlcId(e.target.value)} className="bg-surface border border-border rounded px-1.5 py-1 text-xs font-mono">
          {plcs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="flex rounded border border-border overflow-hidden">
          <button onClick={() => setMode('edit')} className={`px-2 py-1 text-[11px] font-semibold flex items-center gap-1 ${!monitoring ? 'bg-probe text-on-probe' : 'bg-surface'}`}><Pencil className="w-3 h-3" />Edit</button>
          <button onClick={() => setMode('monitor')} className={`px-2 py-1 text-[11px] font-semibold flex items-center gap-1 ${monitoring ? 'bg-probe text-on-probe' : 'bg-surface'}`}><Eye className="w-3 h-3" />Monitor</button>
        </div>
        <select
          value=""
          onChange={(e) => {
            const p = PLC_PRESETS.find((x) => x.id === e.target.value);
            if (p) commit(p.build());
            setSelectedEl(null);
            setSelectedRung(null);
          }}
          className="bg-surface border border-border rounded px-1.5 py-1 text-xs"
          title="Load a ready-made program (replaces the current one; Undo brings it back)"
        >
          <option value="">Load preset…</option>
          {PLC_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-ink-muted">
          Scan
          <select value={program.scanMs} onChange={(e) => commit({ ...program, scanMs: Number(e.target.value) })} className="bg-surface border border-border rounded px-1 py-0.5 text-xs font-mono">
            {[10, 20, 50, 100, 200, 500].map((v) => <option key={v} value={v}>{v} ms</option>)}
          </select>
        </label>
        <button className={btn} onClick={undo} disabled={history.length === 0} title="Undo"><Undo2 className="w-3 h-3" />Undo</button>
        <button className={btn} onClick={() => commit(addRung(program, selectedRung ?? selected?.rungId))}><Plus className="w-3 h-3" />Rung</button>
        <button className={btn} disabled={!rung} onClick={() => rung && setClipboard(cloneRung(rung))}><Copy className="w-3 h-3" />Copy</button>
        <button className={btn} disabled={!rung} onClick={() => { if (rung) { setClipboard(cloneRung(rung)); commit(removeRung(program, rung.id)); setSelectedRung(null); setSelectedEl(null); } }}><Scissors className="w-3 h-3" />Cut</button>
        <button className={btn} disabled={!clipboard} onClick={() => clipboard && commit(pasteRung(program, clipboard, rung?.id))}><ClipboardPaste className="w-3 h-3" />Paste</button>
        <div className="flex-1" />
        {!userMode && (
          <button className={`${btn} bg-probe text-on-probe`} onClick={() => onPatchDeviceState(plc.id, { plcProgram: program, program: 'user' })} title="Run this program instead of the fixed demo behaviour">
            <Play className="w-3 h-3" />Use my program
          </button>
        )}
        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${userMode ? 'text-ok border-ok/50 bg-ok-soft' : 'text-ink-muted border-border'}`}>
          {userMode ? (isSimulating ? `RUN · scan ${runtime.scans}` : 'USER PROGRAM') : `FIXED: ${plc.state.program || 'passthrough'}`}
        </span>
        {forcedCount > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--warning-fill)', color: 'var(--ink)' }}>{forcedCount} FORCED</span>}
      </div>

      {/* I/O strip: inputs, outputs, forces and the scan indicator */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2 overflow-x-auto border-b"
        style={{ background: 'var(--console)', borderColor: 'var(--console-line)', color: 'var(--console-ink)' }}
        aria-label="PLC inputs and outputs"
      >
        <span className="text-[11px] font-mono font-bold tracking-wider shrink-0" style={{ color: 'var(--console-muted)' }}>INPUTS</span>
        {ALL_INPUTS.filter((a) => map.inputs[a]).map((a) => ioCard(a, 'inputs'))}
        <span className="text-[11px] font-mono font-bold tracking-wider shrink-0 ml-3" style={{ color: 'var(--console-muted)' }}>OUTPUTS</span>
        {ALL_OUTPUTS.filter((a) => map.outputs[a]).map((a) => ioCard(a, 'outputs'))}
        <div className="ml-auto pl-3 flex items-center gap-3 shrink-0 text-[11px] font-mono" style={{ color: 'var(--console-muted)' }}>
          {forcedCount > 0 && (
            <button
              onClick={() => onPatchDeviceState(plc.id, { plcForces: { inputs: {}, outputs: {} } })}
              className="rounded-full px-2 h-6 font-bold"
              style={{ background: 'var(--warning-fill)', color: 'var(--ink)' }}
              title="Release every forced input and output"
            >
              {forcedCount} forced · release
            </button>
          )}
          <span className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${userMode && isSimulating ? 'animate-pulse' : ''}`} style={{ background: userMode && isSimulating ? 'var(--console-readout)' : '#4a525c' }} />
            {userMode && isSimulating ? `RUN · scan ${runtime.scans} · ${program.scanMs} ms` : userMode ? 'STOPPED' : 'FIXED PROGRAM'}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Palette */}
        <aside className="w-36 shrink-0 border-r border-border bg-surface overflow-y-auto p-2 text-[11px]">
          {PALETTE.map((g) => (
            <div key={g.title} className="mb-3">
              <div className="font-bold uppercase tracking-wider text-[11px] text-ink-muted mb-1">{g.title}</div>
              <div className="grid grid-cols-2 gap-1">
                {g.kinds.map((k) => (
                  <div
                    key={k.kind}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plc-kind', k.kind);
                      setDragKind(k.kind);
                    }}
                    onDragEnd={() => setDragKind(null)}
                    onClick={() => {
                      // click-to-add as an alternative to dragging: contacts go in series, outputs replace the output
                      const target = rung || program.rungs[program.rungs.length - 1];
                      if (!target) return;
                      const ne = makeElement(k.kind);
                      commit(isOutputKind(k.kind) ? setOutput(program, target.id, ne) : appendContact(program, target.id, ne));
                      setSelectedEl(ne.id);
                    }}
                    title={`${k.hint}. Drag onto a rung, or select a rung and click.`}
                    className="cursor-grab rounded border border-border-strong bg-surface-sunken text-center py-1 font-mono font-bold hover:bg-surface-hover select-none"
                  >
                    {k.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="text-[11px] text-ink-muted leading-snug">
            Drop a contact on an existing contact to put it in parallel. Click a rung, then a palette item, to add it without dragging.
          </div>
        </aside>

        {/* Rungs */}
        <main className="flex-1 min-w-0 overflow-y-auto p-3">
          {program.rungs.length === 0 && (
            <div className="text-xs text-ink-muted border border-dashed border-border rounded-md p-6 text-center">
              Empty program. Press <b>+ Rung</b> and drag contacts and a coil onto it, or load a preset. Wiring: inputs I0.x are the PLC input terminals,
              outputs Q0.x drive its output terminals.
            </div>
          )}
          {program.rungs.map((r, i) => rungView(r, i))}
          {issues.length > 0 && (
            <div className="mt-3 rounded-md border border-border bg-surface p-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Checks ({issues.length})</div>
              <ul className="space-y-0.5">
                {issues.map((it, i) => (
                  <li key={i} className={`text-[11px] ${it.severity === 'error' ? 'text-danger' : 'text-warning'}`}>
                    {it.severity === 'error' ? '✖' : '⚠'} {it.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>

        {/* Properties + I/O */}
        <aside className="w-64 shrink-0 border-l border-border bg-surface overflow-y-auto p-3 text-xs space-y-3">
          {el ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold uppercase tracking-wider text-[11px] text-ink-muted">{el.kind} element</div>
                <button className="text-danger hover:underline flex items-center gap-1" onClick={() => { commit(removeElement(program, el.id)); setSelectedEl(null); }}><Trash2 className="w-3 h-3" />Delete</button>
              </div>
              <select className={field} value={el.kind} onChange={(e) => patchEl({ kind: e.target.value as LadderElementKind })}>
                {PALETTE.flatMap((g) => g.kinds).filter((k) => isOutputKind(k.kind) === isOutputKind(el.kind)).map((k) => <option key={k.kind} value={k.kind}>{k.kind}</option>)}
              </select>
              {!isCompare(el.kind) && (
                <label className="block">
                  <span className="text-[11px] text-ink-muted">Address</span>
                  <select className={field} value={el.address || ''} onChange={(e) => patchEl({ address: e.target.value })}>
                    {addressOptions(el.kind).map((a) => <option key={a} value={a}>{a}{program.symbols[a] ? `  ${program.symbols[a]}` : ''}</option>)}
                  </select>
                </label>
              )}
              {el.address && !isCompare(el.kind) && (
                <label className="block">
                  <span className="text-[11px] text-ink-muted">Symbol name for {el.address}</span>
                  <input
                    className={field}
                    value={program.symbols[el.address] || ''}
                    onChange={(e) => commit({ ...program, symbols: { ...program.symbols, [el.address!]: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') } })}
                    placeholder="e.g. START"
                  />
                </label>
              )}
              {(isTimer(el.kind) || isCounter(el.kind)) && (
                <label className="block">
                  <span className="text-[11px] text-ink-muted">{isTimer(el.kind) ? 'Preset (ms)' : 'Preset (counts)'}</span>
                  <input type="number" min={1} className={field} value={el.preset ?? ''} onChange={(e) => patchEl({ preset: Number(e.target.value) })} />
                </label>
              )}
              {isCounter(el.kind) && (
                <label className="block">
                  <span className="text-[11px] text-ink-muted">{el.kind === 'CTU' ? 'Reset bit' : 'Load bit'}</span>
                  <select className={field} value={el.resetAddress || ''} onChange={(e) => patchEl({ resetAddress: e.target.value || undefined })}>
                    <option value="">none</option>
                    {[...ALL_INPUTS, ...ALL_MEMORY_BITS].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              )}
              {(isCompare(el.kind) || el.kind === 'MOV' || el.kind === 'ADD') && (
                <>
                  <label className="block">
                    <span className="text-[11px] text-ink-muted">A (number or MWn / Tn / Cn)</span>
                    <input className={field} value={String(el.operandA ?? '')} onChange={(e) => patchEl({ operandA: numOrAddr(e.target.value) })} />
                  </label>
                  {el.kind !== 'MOV' && (
                    <label className="block">
                      <span className="text-[11px] text-ink-muted">B</span>
                      <input className={field} value={String(el.operandB ?? '')} onChange={(e) => patchEl({ operandB: numOrAddr(e.target.value) })} />
                    </label>
                  )}
                </>
              )}
            </div>
          ) : rung ? (
            <div className="space-y-2">
              <div className="font-bold uppercase tracking-wider text-[11px] text-ink-muted">Rung {program.rungs.findIndex((r) => r.id === rung.id) + 1}</div>
              <input className={field} value={rung.label || ''} onChange={(e) => commit(updateRung(program, rung.id, { label: e.target.value }))} placeholder="Rung comment" />
              <div className="flex gap-1">
                <button className={btn} onClick={() => commit(moveRung(program, rung.id, -1))}><ArrowUp className="w-3 h-3" />Up</button>
                <button className={btn} onClick={() => commit(moveRung(program, rung.id, 1))}><ArrowDown className="w-3 h-3" />Down</button>
                <button className={`${btn} text-danger`} onClick={() => { commit(removeRung(program, rung.id)); setSelectedRung(null); }}><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ) : (
            <div className="text-ink-muted">Select an element or a rung to edit it.</div>
          )}

          {/* Symbol table (values are live in Monitor mode) */}
          <div>
            <div className="font-bold uppercase tracking-wider text-[11px] text-ink-muted mb-1">Symbol table</div>
            <div className="divide-y divide-border border-y border-border">
              {symbolRows.map((a) => {
                const v = symbolValue(a);
                const forced = a in forces.inputs || a in forces.outputs;
                return (
                  <div key={a} className="flex items-center gap-2 h-7 text-[11px] font-mono">
                    <span className="w-9 text-ink-muted">{a}</span>
                    <span className="flex-1 truncate">{program.symbols[a] || ''}</span>
                    {forced && <span className="rounded-full px-1.5 text-[11px] font-bold" style={{ background: 'var(--warning-fill)', color: 'var(--ink)' }}>F</span>}
                    <span className={`min-w-[28px] text-center rounded-full px-1.5 font-bold ${monitoring && v.on ? 'bg-ok-soft text-ok' : 'bg-surface-sunken text-ink-muted'}`}>{monitoring ? v.text : '-'}</span>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-ink-muted mt-2 leading-snug">
              F = forced. Use the strip above in Monitor mode to force an input or output, and release it before you trust the logic.
            </div>
          </div>

          <div>
            <div className="font-bold uppercase tracking-wider text-[11px] text-ink-muted mb-1">Memory</div>
            <div className="font-mono text-[11px] space-y-0.5">
              <div>M: {ALL_MEMORY_BITS.map((a) => (runtime.bits[a] ? '1' : '0')).join('')}</div>
              {ALL_WORDS.map((a) => <div key={a}>{a} = {runtime.words[a] ?? 0}</div>)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
