import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Keyboard, RotateCcw, Search, X } from 'lucide-react';
import {
  SHORTCUT_DEFINITIONS,
  ShortcutActionId,
  ShortcutCategory,
  ShortcutDefinition,
  eventToShortcutCombo,
  findShortcutConflict,
  formatComboLabel,
  useKeybinds,
} from '../../utils/shortcuts';

interface KeybindsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: ShortcutCategory[] = [
  'Canvas & Navigation',
  'Editing',
  'Simulation & Tools',
  'Views & Panels',
];

export const KeybindsModal: React.FC<KeybindsModalProps> = ({ isOpen, onClose }) => {
  const { overrides, getCombo, setCombo, resetOne, resetAll } = useKeybinds();
  const [query, setQuery] = useState('');
  const [capturingId, setCapturingId] = useState<ShortcutActionId | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{
    targetId: ShortcutActionId;
    combo: string;
    conflictDef: ShortcutDefinition;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCapturingId(null);
      setPendingConflict(null);
      return;
    }
  }, [isOpen]);

  // Capture keystrokes while listening for a new shortcut combo
  useEffect(() => {
    if (!isOpen || !capturingId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setCapturingId(null);
        return;
      }

      const combo = eventToShortcutCombo(e);
      if (!combo) return;

      const conflict = findShortcutConflict(combo, capturingId);
      if (conflict) {
        setPendingConflict({
          targetId: capturingId,
          combo,
          conflictDef: conflict,
        });
        setCapturingId(null);
        return;
      }

      setCombo(capturingId, combo, false);
      setPendingConflict(null);
      setCapturingId(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, capturingId, setCombo]);

  // Escape closes the modal when not actively recording a key
  useEffect(() => {
    if (!isOpen || capturingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, capturingId, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_DEFINITIONS;
    return SHORTCUT_DEFINITIONS.filter((def) => {
      const current = formatComboLabel(getCombo(def.id)).toLowerCase();
      return (
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.category.toLowerCase().includes(q) ||
        current.includes(q)
      );
    });
  }, [query, getCombo]);

  if (!isOpen) return null;

  const customCount = Object.keys(overrides).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts and controls"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !capturingId) onClose();
      }}
    >
      <div className="bg-surface border border-border rounded-lg shadow-2 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden text-ink">
        {/* Header */}
        <header className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 shrink-0 bg-surface">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-md bg-brand-soft flex items-center justify-center shrink-0">
              <Keyboard className="w-4 h-4 text-brand-ink" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-display font-semibold text-ink-muted uppercase tracking-[0.08em] block">
                INPUT &amp; KEYBOARD CONTROLS
              </span>
              <h2 className="text-sm font-bold text-ink truncate">
                Keyboard Shortcuts &amp; Keybinds
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                resetAll();
                setPendingConflict(null);
                setCapturingId(null);
              }}
              disabled={customCount === 0}
              className="h-8 px-2.5 rounded-md border border-border bg-surface hover:bg-surface-hover disabled:opacity-45 disabled:cursor-not-allowed text-xs font-medium text-ink flex items-center gap-1.5 transition focus-visible:outline-none focus-visible:shadow-focus"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset defaults</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close keyboard shortcuts"
              className="p-1.5 rounded-md hover:bg-surface-hover text-ink-muted hover:text-ink transition focus-visible:outline-none focus-visible:shadow-focus"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Search + Status */}
        <div className="px-5 py-3 bg-surface-sunken border-b border-border space-y-2.5 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shortcuts (e.g. pan, zoom, rotate, undo, ladder...)"
              className="w-full pl-8 pr-20 h-8 bg-surface border border-border-strong rounded-md text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-probe focus-visible:shadow-focus"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>

          {pendingConflict && (
            <div className="rounded-md border border-warning/50 bg-warning-soft px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-warning">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <kbd className="px-1.5 py-0.5 rounded-xs border border-warning/40 bg-surface font-mono text-[11px] text-ink">
                    {formatComboLabel(pendingConflict.combo)}
                  </kbd>{' '}
                  is already assigned to <strong>{pendingConflict.conflictDef.label}</strong>. Replace and unbind the other shortcut?
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCombo(pendingConflict.targetId, pendingConflict.combo, true);
                    setPendingConflict(null);
                  }}
                  className="h-7 px-2.5 rounded-md bg-brand hover:bg-brand-strong text-on-brand text-[11px] font-semibold"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setPendingConflict(null)}
                  className="h-7 px-2.5 rounded-md border border-border bg-surface text-ink text-[11px] font-medium hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-ink-muted">
            Click any key badge and press a new key combination to rebind. Arrow keys also nudge selected devices on the workbench (<kbd className="px-1 py-px rounded-xs border border-border bg-surface font-mono text-[10px]">Arrow</kbd> snap step, <kbd className="px-1 py-px rounded-xs border border-border bg-surface font-mono text-[10px]">Shift+Arrow</kbd> 1 px).
          </p>
        </div>

        {/* Shortcut List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {CATEGORIES.map((category) => {
            const rows = filtered.filter((d) => d.category === category);
            if (rows.length === 0) return null;
            return (
              <section key={category} className="space-y-1.5">
                <h3 className="text-[10px] font-display font-semibold uppercase tracking-[0.08em] text-ink-muted pb-1 border-b border-border">
                  {category}
                </h3>
                <div className="divide-y divide-border/60">
                  {rows.map((def) => {
                    const current = getCombo(def.id);
                    const isModified = def.id in overrides;
                    const isListening = capturingId === def.id;
                    return (
                      <div
                        key={def.id}
                        className="py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                            <span>{def.label}</span>
                            {isModified && (
                              <span className="text-[9px] font-mono uppercase px-1.5 py-px rounded-sm bg-probe-soft text-probe">
                                Edited
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-muted truncate">
                            {def.description}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setPendingConflict(null);
                              setCapturingId(isListening ? null : def.id);
                            }}
                            className={`min-w-[112px] h-7 px-2.5 rounded-md border font-mono text-[11px] font-semibold transition focus-visible:outline-none focus-visible:shadow-focus ${
                              isListening
                                ? 'bg-probe text-on-probe border-probe animate-pulse motion-reduce:animate-none'
                                : current
                                ? 'bg-surface-sunken hover:bg-surface-hover border-border-strong text-ink'
                                : 'bg-surface border-dashed border-border-strong text-ink-muted hover:text-ink'
                            }`}
                            title="Click and press a new key combination"
                          >
                            {isListening ? 'Press keys…' : formatComboLabel(current)}
                          </button>

                          {current && (
                            <button
                              type="button"
                              onClick={() => setCombo(def.id, '', false)}
                              title="Unbind shortcut"
                              aria-label={`Unbind ${def.label}`}
                              className="h-7 w-7 rounded-md border border-border bg-surface hover:bg-surface-hover text-ink-muted hover:text-danger flex items-center justify-center transition"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}

                          {isModified && (
                            <button
                              type="button"
                              onClick={() => resetOne(def.id)}
                              title={`Restore default (${formatComboLabel(def.defaultCombo)})`}
                              aria-label={`Restore default for ${def.label}`}
                              className="h-7 w-7 rounded-md border border-border bg-surface hover:bg-surface-hover text-ink-muted hover:text-ink flex items-center justify-center transition"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-10 text-center text-xs text-ink-muted">
              No shortcuts matched &ldquo;{query.trim()}&rdquo;.
            </div>
          )}
        </div>

        {/* Footer: Touchpad & Mouse Controls Summary */}
        <footer className="px-5 py-2.5 border-t border-border bg-surface-sunken text-[11px] text-ink-muted flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <strong className="text-ink">2-Button Mouse:</strong> Use <strong className="text-ink">Pan</strong> tool, <kbd className="px-1 py-px rounded-xs border border-border bg-surface font-mono text-[10px]">Space</kbd>+drag, or <kbd className="px-1 py-px rounded-xs border border-border bg-surface font-mono text-[10px]">Shift</kbd>+wheel
            </span>
            <span>
              <strong className="text-ink">Touchpad / Touch:</strong> Enable <strong className="text-ink">Trackpad</strong> mode for 2-finger pan &amp; pinch zoom
            </span>
          </div>
          <span className="font-mono text-[10px] text-ink-muted">Saved locally</span>
        </footer>
      </div>
    </div>
  );
};
