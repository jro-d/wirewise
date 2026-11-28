import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DesktopAppInfo, DesktopUpdateStatus, OpenedProjectFile } from '../types/desktop';

export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function listenEvent<T>(eventName: string, callback: (payload: T) => void): () => void {
  let disposed = false;
  let unlistenFn: (() => void) | null = null;

  void listen<T>(eventName, (event) => {
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
    onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) =>
      listenEvent<DesktopUpdateStatus>('desktop:update-status', callback),
    onOpenKeybinds: (callback: () => void) =>
      listenEvent<void>('desktop:open-keybinds', () => callback()),
    onResetKeybinds: (callback: () => void) =>
      listenEvent<void>('desktop:reset-keybinds', () => callback()),
    onOpenHelp: (callback: () => void) =>
      listenEvent<void>('desktop:open-help', () => callback()),
    onRestartWalkthrough: (callback: () => void) =>
      listenEvent<void>('desktop:restart-walkthrough', () => callback()),
    onOpenUpdateLogs: (callback: () => void) =>
      listenEvent<void>('desktop:open-update-logs', () => callback()),
    onOpenStandardsNotice: (callback: () => void) =>
      listenEvent<void>('desktop:open-standards-notice', () => callback()),
    takeOpenedFile: () => invoke<OpenedProjectFile | null>('desktop_take_opened_file'),
    onOpenFile: (callback: () => void) =>
      listenEvent<void>('desktop:open-file', () => callback()),
  };
}
