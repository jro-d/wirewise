import { useSyncExternalStore } from 'react';

export type ShortcutCategory =
  | 'Canvas & Navigation'
  | 'Editing'
  | 'Simulation & Tools'
  | 'Views & Panels';

export type ShortcutActionId =
  | 'tool.select'
  | 'tool.pan'
  | 'tool.toggleInputMode'
  | 'canvas.fit'
  | 'canvas.zoomIn'
  | 'canvas.zoomOut'
  | 'canvas.zoomReset'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.duplicate'
  | 'edit.rotate'
  | 'edit.lock'
  | 'edit.inspect'
  | 'edit.selectAll'
  | 'edit.delete'
  | 'edit.deselect'
  | 'sim.toggle'
  | 'sim.reset'
  | 'panel.library'
  | 'panel.inspector'
  | 'panel.dmm'
  | 'panel.keybinds'
  | 'view.realistic'
  | 'view.split'
  | 'view.ladder'
  | 'view.schematic'
  | 'view.plc'
  | 'view.plan';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  category: ShortcutCategory;
  label: string;
  description: string;
  defaultCombo: string;
  /** Extra fallback combos that always work alongside the primary combo unless rebound elsewhere */
  aliases?: string[];
}

export const KEYBINDS_STORAGE_KEY = 'wirewise-keybinds-v1';

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // Canvas & Navigation
  {
    id: 'tool.select',
    category: 'Canvas & Navigation',
    label: 'Select tool',
    description: 'Switch canvas pointer back to selection and wiring',
    defaultCombo: 'V',
  },
  {
    id: 'tool.pan',
    category: 'Canvas & Navigation',
    label: 'Pan tool',
    description: 'Pan left-click drag anywhere on the canvas (no scroll-wheel click needed)',
    defaultCombo: 'H',
  },
  {
    id: 'tool.toggleInputMode',
    category: 'Canvas & Navigation',
    label: 'Toggle Mouse / Trackpad mode',
    description: 'Switch wheel behavior between Mouse zoom and Trackpad two-finger pan',
    defaultCombo: 'Alt+T',
  },
  {
    id: 'canvas.fit',
    category: 'Canvas & Navigation',
    label: 'Fit drawing to view',
    description: 'Center and scale the circuit to fit the viewport',
    defaultCombo: 'F',
  },
  {
    id: 'canvas.zoomIn',
    category: 'Canvas & Navigation',
    label: 'Zoom in',
    description: 'Zoom in on the active canvas',
    defaultCombo: '=',
    aliases: ['+'],
  },
  {
    id: 'canvas.zoomOut',
    category: 'Canvas & Navigation',
    label: 'Zoom out',
    description: 'Zoom out on the active canvas',
    defaultCombo: '-',
  },
  {
    id: 'canvas.zoomReset',
    category: 'Canvas & Navigation',
    label: 'Reset zoom (1:1)',
    description: 'Reset camera zoom to 100% at the origin',
    defaultCombo: '0',
  },

  // Editing
  {
    id: 'edit.undo',
    category: 'Editing',
    label: 'Undo',
    description: 'Undo the last wiring or device change',
    defaultCombo: 'Ctrl+Z',
  },
  {
    id: 'edit.redo',
    category: 'Editing',
    label: 'Redo',
    description: 'Redo the previously undone change',
    defaultCombo: 'Ctrl+Y',
    aliases: ['Ctrl+Shift+Z'],
  },
  {
    id: 'edit.copy',
    category: 'Editing',
    label: 'Copy device',
    description: 'Copy the selected device to the clipboard',
    defaultCombo: 'Ctrl+C',
  },
  {
    id: 'edit.paste',
    category: 'Editing',
    label: 'Paste device',
    description: 'Paste the copied device onto the canvas',
    defaultCombo: 'Ctrl+V',
  },
  {
    id: 'edit.duplicate',
    category: 'Editing',
    label: 'Duplicate selected device',
    description: 'Clone the selected device in place',
    defaultCombo: 'Ctrl+D',
  },
  {
    id: 'edit.rotate',
    category: 'Editing',
    label: 'Rotate device 90°',
    description: 'Rotate the selected device clockwise by 90°',
    defaultCombo: 'R',
  },
  {
    id: 'edit.lock',
    category: 'Editing',
    label: 'Lock / unlock device position',
    description: 'Prevent accidental dragging of selected devices',
    defaultCombo: 'L',
  },
  {
    id: 'edit.inspect',
    category: 'Editing',
    label: 'Inspect selected item',
    description: 'Open Device or Conductor Inspector without double-clicking',
    defaultCombo: 'O',
  },
  {
    id: 'edit.selectAll',
    category: 'Editing',
    label: 'Select all',
    description: 'Select all devices and wires on the realistic workbench',
    defaultCombo: 'Ctrl+A',
  },
  {
    id: 'edit.delete',
    category: 'Editing',
    label: 'Delete selected',
    description: 'Remove selected devices or wires',
    defaultCombo: 'Delete',
    aliases: ['Backspace'],
  },
  {
    id: 'edit.deselect',
    category: 'Editing',
    label: 'Cancel / clear selection',
    description: 'Cancel active wiring or clear the current selection',
    defaultCombo: 'Escape',
  },

  // Simulation & Tools
  {
    id: 'sim.toggle',
    category: 'Simulation & Tools',
    label: 'Start / stop simulation',
    description: 'Energize or de-energize the circuit',
    defaultCombo: 'Ctrl+Enter',
  },
  {
    id: 'sim.reset',
    category: 'Simulation & Tools',
    label: 'Reset tripped breakers',
    description: 'Re-arm tripped breakers, RCDs, and replaceable fuses',
    defaultCombo: 'Ctrl+Shift+R',
  },
  {
    id: 'panel.library',
    category: 'Simulation & Tools',
    label: 'Toggle component library',
    description: 'Show or hide the component drawer',
    defaultCombo: 'B',
  },
  {
    id: 'panel.inspector',
    category: 'Simulation & Tools',
    label: 'Toggle code inspector HUD',
    description: 'Show or hide the PEC/IEC Code Inspector panel',
    defaultCombo: 'I',
  },
  {
    id: 'panel.dmm',
    category: 'Simulation & Tools',
    label: 'Toggle meters & test instruments',
    description: 'Enable or disable DMM, clamp meter, megger, and continuity probes',
    defaultCombo: 'M',
  },
  {
    id: 'panel.keybinds',
    category: 'Simulation & Tools',
    label: 'Open keyboard shortcuts',
    description: 'Open this keybinds customization panel',
    defaultCombo: 'Ctrl+/',
  },

  // Views & Panels
  {
    id: 'view.realistic',
    category: 'Views & Panels',
    label: 'Realistic Wiring view',
    description: 'Switch to the physical wiring workbench',
    defaultCombo: '1',
  },
  {
    id: 'view.split',
    category: 'Views & Panels',
    label: 'Dual Split view',
    description: 'Switch to Workbench + Ladder / SLD split view',
    defaultCombo: '2',
  },
  {
    id: 'view.ladder',
    category: 'Views & Panels',
    label: 'Ladder Logic view',
    description: 'Switch to the control ladder diagram',
    defaultCombo: '3',
  },
  {
    id: 'view.schematic',
    category: 'Views & Panels',
    label: 'SLD Schematic view',
    description: 'Switch to the single-line diagram',
    defaultCombo: '4',
  },
  {
    id: 'view.plc',
    category: 'Views & Panels',
    label: 'PLC Editor view',
    description: 'Switch to the PLC program editor',
    defaultCombo: '5',
  },
  {
    id: 'view.plan',
    category: 'Views & Panels',
    label: 'Floor Plan view',
    description: 'Switch to the floor plan layout',
    defaultCombo: '6',
  },
];

export type KeybindOverrides = Partial<Record<ShortcutActionId, string>>;

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export function normalizeKeyName(rawKey: string): string {
  if (!rawKey) return '';
  if (rawKey === ' ') return 'Space';
  if (rawKey === '+') return '='; // treat unshifted/shifted '=' consistently
  const lower = rawKey.toLowerCase();
  if (lower === 'esc') return 'Escape';
  if (lower === 'del') return 'Delete';
  if (lower === 'spacebar') return 'Space';
  if (rawKey.length === 1) return rawKey.toUpperCase();
  if (['escape', 'enter', 'tab', 'backspace', 'delete', 'space', 'home', 'end', 'pageup', 'pagedown'].includes(lower)) {
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  if (lower.startsWith('arrow')) {
    return 'Arrow' + lower.slice(5, 6).toUpperCase() + lower.slice(6);
  }
  if (/^f\d{1,2}$/i.test(rawKey)) return rawKey.toUpperCase();
  return rawKey;
}

export function normalizeCombo(combo: string): string {
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  let ctrl = false;
  let alt = false;
  let shift = false;
  let key = '';
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'meta' || lower === 'mod') {
      ctrl = true;
    } else if (lower === 'alt' || lower === 'option') {
      alt = true;
    } else if (lower === 'shift') {
      shift = true;
    } else {
      key = normalizeKeyName(part);
    }
  }
  if (!key) return '';
  const tokens: string[] = [];
  if (ctrl) tokens.push('Ctrl');
  if (alt) tokens.push('Alt');
  if (shift) tokens.push('Shift');
  tokens.push(key);
  return tokens.join('+');
}

export function eventToShortcutCombo(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const key = normalizeKeyName(e.key);
  if (!key) return null;
  const tokens: string[] = [];
  if (e.ctrlKey || e.metaKey) tokens.push('Ctrl');
  if (e.altKey) tokens.push('Alt');
  // Avoid recording Shift+ for shifted symbols like '?' or '+' unless paired with Ctrl/Alt or letters/navigation
  const isPureShiftedPunctuation =
    e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && key.length === 1 && !/^[A-Z0-9]$/.test(key);
  if (e.shiftKey && !isPureShiftedPunctuation) tokens.push('Shift');
  tokens.push(key);
  return tokens.join('+');
}

export function matchesCombo(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  combo: string
): boolean {
  const target = normalizeCombo(combo);
  if (!target) return false;
  const pressed = eventToShortcutCombo(e);
  if (pressed === target) return true;
  // Special case: pressing '+' (Shift+=) when shortcut is '='
  if (target === '=' && (e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    return true;
  }
  return false;
}

export function formatComboLabel(combo: string): string {
  const norm = normalizeCombo(combo);
  if (!norm) return 'Unassigned';
  return norm
    .split('+')
    .map((part) => (part === 'Delete' ? 'Del' : part === 'Escape' ? 'Esc' : part))
    .join('+');
}

function readSavedOverrides(): KeybindOverrides {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(KEYBINDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const clean: KeybindOverrides = {};
    for (const def of SHORTCUT_DEFINITIONS) {
      const val = parsed[def.id];
      if (typeof val === 'string') {
        clean[def.id] = val === '' ? '' : normalizeCombo(val);
      }
    }
    return clean;
  } catch {
    return {};
  }
}

let overrides: KeybindOverrides = readSavedOverrides();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(next: KeybindOverrides): void {
  overrides = next;
  try {
    if (typeof localStorage !== 'undefined') {
      if (Object.keys(next).length === 0) localStorage.removeItem(KEYBINDS_STORAGE_KEY);
      else localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* storage unavailable */
  }
  emit();
}

export function getKeybindOverrides(): KeybindOverrides {
  return overrides;
}

export function getShortcutCombo(id: ShortcutActionId): string {
  const ov = overrides[id];
  if (ov !== undefined) return ov;
  return SHORTCUT_DEFINITIONS.find((d) => d.id === id)?.defaultCombo ?? '';
}

export function setShortcutCombo(id: ShortcutActionId, rawCombo: string, clearConflicts = false): void {
  const norm = rawCombo === '' ? '' : normalizeCombo(rawCombo);
  const def = SHORTCUT_DEFINITIONS.find((d) => d.id === id);
  if (!def) return;
  const next: KeybindOverrides = { ...overrides };
  if (clearConflicts && norm) {
    for (const other of SHORTCUT_DEFINITIONS) {
      if (other.id === id) continue;
      if (getEffectiveCombo(other.id, next) === norm) {
        next[other.id] = '';
      }
    }
  }
  if (norm === def.defaultCombo) {
    delete next[id];
  } else {
    next[id] = norm;
  }
  persist(next);
}

export function resetShortcutCombo(id: ShortcutActionId): void {
  if (!(id in overrides)) return;
  const next = { ...overrides };
  delete next[id];
  persist(next);
}

export function resetAllShortcuts(): void {
  persist({});
}

function getEffectiveCombo(id: ShortcutActionId, map: KeybindOverrides): string {
  if (map[id] !== undefined) return map[id] as string;
  return SHORTCUT_DEFINITIONS.find((d) => d.id === id)?.defaultCombo ?? '';
}

export function findShortcutConflict(
  combo: string,
  excludeId?: ShortcutActionId,
  customOverrides: KeybindOverrides = overrides
): ShortcutDefinition | null {
  const norm = normalizeCombo(combo);
  if (!norm) return null;
  for (const def of SHORTCUT_DEFINITIONS) {
    if (def.id === excludeId) continue;
    if (getEffectiveCombo(def.id, customOverrides) === norm) {
      return def;
    }
  }
  return null;
}

export function matchesShortcutAction(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  id: ShortcutActionId
): boolean {
  const primary = getShortcutCombo(id);
  if (primary && matchesCombo(e, primary)) return true;
  const def = SHORTCUT_DEFINITIONS.find((d) => d.id === id);
  // Only apply aliases when this action hasn't been explicitly unbound, and the alias isn't bound to another action
  if (primary && def?.aliases) {
    for (const alias of def.aliases) {
      if (!findShortcutConflict(alias, id) && matchesCombo(e, alias)) return true;
    }
  }
  return false;
}

export function isEditableEventTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  return !!el.isContentEditable;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useKeybinds(): {
  overrides: KeybindOverrides;
  getCombo: (id: ShortcutActionId) => string;
  getLabel: (id: ShortcutActionId) => string;
  setCombo: (id: ShortcutActionId, combo: string, clearConflicts?: boolean) => void;
  resetOne: (id: ShortcutActionId) => void;
  resetAll: () => void;
} {
  const current = useSyncExternalStore(subscribe, getKeybindOverrides, getKeybindOverrides);
  return {
    overrides: current,
    getCombo: (id) => getEffectiveCombo(id, current),
    getLabel: (id) => formatComboLabel(getEffectiveCombo(id, current)),
    setCombo: setShortcutCombo,
    resetOne: resetShortcutCombo,
    resetAll: resetAllShortcuts,
  };
}
