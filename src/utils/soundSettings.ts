/** The saved sound on / off switch. Sounds are on until the user turns them off. */
import { useSyncExternalStore } from 'react';

export const SOUND_MUTED_KEY = 'wirewise.sound.muted';

function readSaved(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SOUND_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

let muted = readSaved();
const listeners = new Set<() => void>();

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  try {
    if (typeof localStorage !== 'undefined') {
      if (next) localStorage.setItem(SOUND_MUTED_KEY, '1');
      else localStorage.removeItem(SOUND_MUTED_KEY);
    }
  } catch {
    /* storage unavailable: the switch lasts for this visit only */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSoundMuted(): boolean {
  return useSyncExternalStore(subscribe, isSoundMuted, isSoundMuted);
}
