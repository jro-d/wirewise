import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DesktopAppInfo, DesktopUpdateStatus } from '../types/desktop';

export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Exposes `window.wirewiseDesktop` when running inside the Tauri desktop shell,
 * keeping the existing React UI (`App.tsx`, `TopNavBar.tsx`, `UpdateBanner.tsx`)
 * decoupled from the underlying desktop runtime and completely untouched on the web.
 */
export function initDesktopBridge(): void {
  if (!isTauriDesktop() || window.wirewiseDesktop) {
    return;
  }

  window.wirewiseDesktop = {
    getInfo: () => invoke<DesktopAppInfo>('desktop_get_info'),
    checkForUpdates: () => invoke<void>('desktop_check_updates'),
    downloadUpdate: () => invoke<void>('desktop_download_update'),
    installUpdate: () => invoke<void>('desktop_install_update'),
    onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => {
      let disposed = false;
      let unlistenFn: (() => void) | null = null;

      void listen<DesktopUpdateStatus>('desktop:update-status', (event) => {
        if (!disposed) {
          callback(event.payload);
        }
      })
        .then((fn) => {
          if (disposed) {
            fn();
          } else {
            unlistenFn = fn;
          }
        })
        .catch(() => {
          /* ignore listener setup failures */
        });

      return () => {
        disposed = true;
        if (unlistenFn) {
          unlistenFn();
          unlistenFn = null;
        }
      };
    },
  };
}
