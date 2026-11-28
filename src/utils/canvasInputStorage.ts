import { useSyncExternalStore } from 'react';

export type CanvasInputMode = 'mouse' | 'trackpad';
export type CanvasToolMode = 'select' | 'pan';

export const CANVAS_INPUT_MODE_KEY = 'wirewise-canvas-input-mode';

function readInitialInputMode(): CanvasInputMode {
  try {
    if (typeof localStorage === 'undefined') return 'mouse';
    const raw = localStorage.getItem(CANVAS_INPUT_MODE_KEY);
    return raw === 'trackpad' ? 'trackpad' : 'mouse';
  } catch {
    return 'mouse';
  }
}

let inputMode: CanvasInputMode = readInitialInputMode();
let toolMode: CanvasToolMode = 'select';
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCanvasInputMode(): CanvasInputMode {
  return inputMode;
}

export function setCanvasInputMode(next: CanvasInputMode): void {
  if (inputMode === next) return;
  inputMode = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CANVAS_INPUT_MODE_KEY, next);
    }
  } catch {
    /* ignore storage failures */
  }
  emit();
}

export function toggleCanvasInputMode(): void {
  setCanvasInputMode(inputMode === 'mouse' ? 'trackpad' : 'mouse');
}

export function getCanvasToolMode(): CanvasToolMode {
  return toolMode;
}

export function setCanvasToolMode(next: CanvasToolMode): void {
  if (toolMode === next) return;
  toolMode = next;
  emit();
}

export function useCanvasInputMode(): [CanvasInputMode, (mode: CanvasInputMode) => void] {
  const mode = useSyncExternalStore(subscribe, getCanvasInputMode, getCanvasInputMode);
  return [mode, setCanvasInputMode];
}

export function useCanvasToolMode(): [CanvasToolMode, (mode: CanvasToolMode) => void] {
  const mode = useSyncExternalStore(subscribe, getCanvasToolMode, getCanvasToolMode);
  return [mode, setCanvasToolMode];
}
