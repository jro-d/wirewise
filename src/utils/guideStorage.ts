/**
 * What the first-run walkthrough and "What's New" remember between launches.
 * If storage throws (blocked or full), the values are kept in memory so nothing nags twice in one session.
 */
export const WALKTHROUGH_SEEN_KEY = 'wirewise.walkthrough.seen';
export const LAST_SEEN_VERSION_KEY = 'wirewise.lastSeenVersion';
export const UNREAD_NOTES_KEY = 'wirewise.whatsNew.unread';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface GuideStore {
  walkthroughSeen(): boolean;
  markWalkthroughSeen(): void;
  lastSeenVersion(): string | null;
  setLastSeenVersion(version: string): void;
  /** True after What's New was dismissed without "Got it": drives the dot on Help */
  hasUnreadNotes(): boolean;
  setUnreadNotes(unread: boolean): void;
}

export function createGuideStore(getStorage: () => KeyValueStore | null | undefined): GuideStore {
  // Values written this session. null means removed.
  const memory = new Map<string, string | null>();

  const read = (key: string): string | null => {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return getStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const write = (key: string, value: string | null) => {
    memory.set(key, value);
    try {
      if (value === null) getStorage()?.removeItem(key);
      else getStorage()?.setItem(key, value);
    } catch {
      /* storage unavailable: the memory copy covers this session */
    }
  };

  return {
    walkthroughSeen: () => read(WALKTHROUGH_SEEN_KEY) === '1',
    markWalkthroughSeen: () => write(WALKTHROUGH_SEEN_KEY, '1'),
    lastSeenVersion: () => read(LAST_SEEN_VERSION_KEY),
    setLastSeenVersion: (version) => write(LAST_SEEN_VERSION_KEY, version),
    hasUnreadNotes: () => read(UNREAD_NOTES_KEY) === '1',
    setUnreadNotes: (unread) => write(UNREAD_NOTES_KEY, unread ? '1' : null),
  };
}

export const guideStore = createGuideStore(() => (typeof localStorage === 'undefined' ? null : localStorage));

/** Compares dotted version numbers: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface LaunchContext {
  appVersion: string;
  walkthroughSeen: boolean;
  lastSeenVersion: string | null;
  /** The bundled changelog has an entry for appVersion */
  hasReleaseNotes: boolean;
  /** Opened from a #share= link or a saved standalone .html file */
  openedFromFile: boolean;
  /** Phone view-only layout */
  viewOnly: boolean;
}

export interface LaunchPlan {
  walkthrough: boolean;
  whatsNew: boolean;
  /** Record appVersion as seen now, without showing anything */
  storeVersion: boolean;
}

/**
 * Which guide, if any, to show on launch. A first run gets the walkthrough only (also for people updating
 * from a release that stored nothing). What's New opens once when the version has gone up.
 */
export function planLaunch(c: LaunchContext): LaunchPlan {
  const nothing: LaunchPlan = { walkthrough: false, whatsNew: false, storeVersion: false };
  // Someone else's circuit: show nothing and remember nothing, so the first normal launch still gets the guide
  if (c.openedFromFile) return nothing;

  if (!c.walkthroughSeen && !c.viewOnly) return { ...nothing, walkthrough: true, storeVersion: true };

  const newer = c.lastSeenVersion !== null && compareVersions(c.appVersion, c.lastSeenVersion) > 0;
  if (newer && c.hasReleaseNotes) return { ...nothing, whatsNew: true };

  // First run, same version or downgrade
  return { ...nothing, storeVersion: c.lastSeenVersion !== c.appVersion };
}
