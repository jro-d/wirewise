export type DesktopUpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface DesktopUpdateStatus {
  state: DesktopUpdateState;
  version?: string;
  percent?: number;
  message?: string;
  manual?: boolean;
}

export interface DesktopAppInfo {
  version: string;
  platform: string;
  isPackaged: boolean;
}

/** A project file Windows asked the app to open */
export interface OpenedProjectFile {
  name: string;
  contents: string;
}

export interface WireWiseDesktopBridge {
  getInfo: () => Promise<DesktopAppInfo>;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
  onOpenKeybinds?: (callback: () => void) => () => void;
  onResetKeybinds?: (callback: () => void) => () => void;
  onOpenHelp?: (callback: () => void) => () => void;
  onRestartWalkthrough?: (callback: () => void) => () => void;
  onOpenUpdateLogs?: (callback: () => void) => () => void;
  onOpenStandardsNotice?: (callback: () => void) => () => void;
  /** The file waiting to be opened, if any. Each file is handed over once. */
  takeOpenedFile?: () => Promise<OpenedProjectFile | null>;
  onOpenFile?: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    wirewiseDesktop?: WireWiseDesktopBridge;
  }
}
