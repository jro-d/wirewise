import React, { useState } from 'react';
import { ArrowUp, Check, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { CHANGE_KINDS, CHANGE_KIND_LABEL, ChangeKind, MAX_BULLETS_PER_KIND, RELEASES, Release } from '../../data/changelog';
import { APP_VERSION } from '../../utils/appVersion';
import { KeyText } from './KeyText';
import { DismissReason, ModalShell } from './ModalShell';

const BADGE: Record<ChangeKind, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  new: { icon: Plus, tone: 'bg-brand-soft text-brand-ink border-transparent' },
  improved: { icon: ArrowUp, tone: 'bg-surface-sunken text-ink border-border' },
  fixed: { icon: Check, tone: 'bg-ok-soft text-ok border-transparent' },
};

const Badge: React.FC<{ kind: ChangeKind }> = ({ kind }) => {
  const { icon: Icon, tone } = BADGE[kind];
  return (
    <span className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-2 text-[11px] font-semibold tracking-[0.02em] ${tone}`}>
      <Icon className="h-3 w-3" />
      {CHANGE_KIND_LABEL[kind]}
    </span>
  );
};

export function formatReleaseDate(date: string | null): string {
  if (!date) return 'Not yet released';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

const Bullets: React.FC<{ release: Release; kind: ChangeKind }> = ({ release, kind }) => (
  <ul className="m-0 mt-1.5 list-disc pl-[18px] text-[13px] leading-relaxed">
    {(release.changes[kind] ?? []).slice(0, MAX_BULLETS_PER_KIND).map((b) => (
      <li key={b.lead} className="mb-1">
        <b className="font-semibold">{b.lead}</b> <KeyText text={b.text} />
      </li>
    ))}
  </ul>
);

const VERSION_BRAND = 'rounded-sm bg-brand-soft px-2 py-0.5 font-mono text-xs font-medium text-brand-ink';
const VERSION_NEUTRAL = 'rounded-sm border border-border bg-surface-sunken px-2 py-0.5 font-mono text-xs font-medium text-ink';
const FOCUS = 'focus-visible:outline-none focus-visible:shadow-focus';
const CLOSE = `inline-flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover shrink-0 ${FOCUS}`;
const PANEL = 'w-[500px] max-w-full max-h-full rounded-lg border border-border';

/** Opens once after an update. "Got it" and Close mark it read; Esc or the scrim leave a dot on Help. */
export const WhatsNewModal: React.FC<{
  release: Release;
  touch: boolean;
  onDismiss: (reason: DismissReason | 'confirm') => void;
  onViewAll: () => void;
}> = ({ release, touch, onDismiss, onViewAll }) => (
  <ModalShell label={`What's new in v${release.version}`} onDismiss={onDismiss} panelClassName={PANEL}>
    <header className="flex shrink-0 flex-col gap-1.5 border-b border-border px-5 pb-3 pt-4">
      <div className="flex items-center">
        <span className="flex-1 font-display text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">What's new</span>
        <button type="button" onClick={() => onDismiss('close')} aria-label="Close what's new" className={`${CLOSE} ${touch ? 'h-11 w-11' : 'h-7 w-7'}`}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <h2 data-autofocus tabIndex={-1} className="m-0 flex items-center gap-2.5 focus:outline-none focus-visible:shadow-none">
        <span className="text-xl font-semibold">WireWise</span>
        <span className={VERSION_BRAND}>v{release.version}</span>
        <span className="ml-auto text-xs font-normal text-ink-muted">{formatReleaseDate(release.date)}</span>
      </h2>
    </header>
    <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto px-5 py-4 [&>*]:shrink-0">
      {CHANGE_KINDS.filter((k) => release.changes[k]?.length).map((kind) => (
        <section key={kind}>
          <Badge kind={kind} />
          <Bullets release={release} kind={kind} />
        </section>
      ))}
    </div>
    <footer className="flex shrink-0 items-center gap-3 border-t border-border bg-surface-sunken px-5 py-3">
      <button type="button" onClick={onViewAll} className={`rounded-sm text-[13px] font-medium text-ink-muted underline hover:text-ink ${touch ? 'min-h-[44px]' : ''} ${FOCUS}`}>
        View all releases
      </button>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => onDismiss('confirm')}
        className={`rounded-md border border-brand bg-brand px-3 text-[13px] font-semibold text-on-brand hover:border-brand-strong hover:bg-brand-strong ${touch ? 'h-11' : 'h-8'} ${FOCUS}`}
      >
        Got it
      </button>
    </footer>
  </ModalShell>
);

type Filter = 'all' | ChangeKind;
const FILTERS: Filter[] = ['all', 'new', 'improved', 'fixed'];
const PAGE_SIZE = 3;

/** Help > Update Logs: every release, newest expanded, bundled with the app so it works offline. */
export const UpdateLogsModal: React.FC<{ touch: boolean; onClose: () => void }> = ({ touch, onClose }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Releases the reader opened or closed; the first one in the list is open unless closed
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const releases = RELEASES.filter((r) => filter === 'all' || r.changes[filter]?.length);
  const shown = releases.slice(0, limit);

  const choose = (next: Filter) => {
    setFilter(next);
    setLimit(PAGE_SIZE);
    setToggled({});
  };

  return (
    <ModalShell label="Update Logs" onDismiss={onClose} panelClassName={`${PANEL} h-[560px]`}>
      <header className="flex shrink-0 flex-col gap-2.5 border-b border-border px-5 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <h2 data-autofocus tabIndex={-1} className="m-0 flex-1 text-base font-semibold focus:outline-none focus-visible:shadow-none">
            Update Logs
          </h2>
          <span className="font-mono text-[11px] text-ink-muted">Installed v{APP_VERSION}</span>
          <button type="button" onClick={onClose} aria-label="Close update logs" className={`${CLOSE} ${touch ? 'h-11 w-11' : 'h-7 w-7'}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div role="group" aria-label="Filter changes" className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => choose(f)}
              className={`rounded-md border px-2.5 text-xs ${touch ? 'h-11' : 'h-7'} ${FOCUS} ${
                filter === f ? 'border-probe bg-probe-soft font-semibold text-probe' : 'border-border-strong text-ink hover:bg-surface-hover'
              }`}
            >
              {f === 'all' ? 'All' : CHANGE_KIND_LABEL[f]}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-2">
        {shown.map((release, i) => {
          const open = toggled[release.version] ?? i === 0;
          const installed = release.version === APP_VERSION;
          const Chevron = open ? ChevronUp : ChevronDown;
          return (
            <article key={release.version} className="border-b border-border">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setToggled((t) => ({ ...t, [release.version]: !open }))}
                className={`flex w-full items-center gap-2.5 rounded-sm py-3 text-left ${FOCUS}`}
              >
                <span className={installed ? VERSION_BRAND : VERSION_NEUTRAL}>v{release.version}</span>
                {installed && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">Installed</span>}
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{open ? '' : release.summary}</span>
                <span className="shrink-0 text-xs text-ink-muted">{formatReleaseDate(release.date)}</span>
                <Chevron className="h-4 w-4 shrink-0 text-ink-muted" />
              </button>
              {open && (
                <div className="flex flex-col gap-2.5 pb-3">
                  {CHANGE_KINDS.filter((k) => (filter === 'all' || filter === k) && release.changes[k]?.length).map((kind) => (
                    <section key={kind}>
                      <Badge kind={kind} />
                      <Bullets release={release} kind={kind} />
                    </section>
                  ))}
                </div>
              )}
            </article>
          );
        })}
        {releases.length === 0 ? (
          <p role="status" className="m-0 py-6 text-center text-[13px] text-ink-muted">
            No releases match this filter.
          </p>
        ) : (
          <div className="flex items-center gap-2.5 pt-3 text-xs text-ink-muted">
            <span className="flex-1" role="status">
              Showing {shown.length} of {releases.length} releases
            </span>
            {shown.length < releases.length && (
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                className={`rounded-md border border-border-strong px-3 text-[13px] font-medium text-ink hover:bg-surface-hover ${touch ? 'h-11' : 'h-8'} ${FOCUS}`}
              >
                Load older
              </button>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
