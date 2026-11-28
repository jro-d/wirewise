import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, CircleHelp, Search, X } from 'lucide-react';
import { HELP_SECTIONS, HelpSection, HelpSectionId, STANDARDS_NOTICE, searchHelp } from '../../data/helpContent';
import { WALKTHROUGH_STEPS } from '../../data/walkthroughSteps';
import { APP_VERSION } from '../../utils/appVersion';
import { matchesShortcutAction } from '../../utils/shortcuts';
import type { Breakpoint } from '../../hooks/useBreakpoint';
import { KeyText, Kbd } from './KeyText';
import { ModalShell } from './ModalShell';

interface HelpPanelProps {
  layout: Breakpoint;
  section: HelpSectionId;
  onSectionChange: (id: HelpSectionId) => void;
  onClose: () => void;
  /** Omitted on phones, where the walkthrough does not run */
  onRestartWalkthrough?: () => void;
  onOpenShortcuts?: () => void;
}

const BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium transition motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-focus';
const SECONDARY = `${BUTTON} border-border-strong bg-surface text-ink hover:bg-surface-hover`;
const PRIMARY = `${BUTTON} border-brand bg-brand text-on-brand font-semibold hover:bg-brand-strong hover:border-brand-strong`;
const EYEBROW = 'font-display font-semibold uppercase tracking-[0.08em] text-xs text-ink-muted';
const TAG = 'rounded-sm bg-surface-sunken px-1.5 py-px text-[11px] font-medium text-ink-muted whitespace-nowrap';
const ICON_BUTTON = 'inline-flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover shrink-0 focus-visible:outline-none focus-visible:shadow-focus';

/** The matching part of a title or row label in bold while searching */
const Match: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-bold">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
};

const Rows: React.FC<{ section: HelpSection; stacked: boolean; query?: string }> = ({ section, stacked, query = '' }) => (
  <>
    {section.groups.map((group, i) => (
      <div key={group.title ?? i}>
        {group.title && <div className={`${EYEBROW} pb-1.5`}>{group.title}</div>}
        {group.rows.map((row) => (
          <div key={row.label} className={`flex gap-x-3 gap-y-0.5 border-t border-border py-2 text-[13px] leading-normal ${stacked ? 'flex-col' : ''}`}>
            <div className={`shrink-0 ${stacked ? '' : 'w-[150px]'} ${query ? 'font-normal' : 'font-semibold'}`}>
              <Match text={row.label} query={query} />
            </div>
            <div className="flex-1 text-ink-muted">
              <KeyText text={row.text} />
            </div>
          </div>
        ))}
      </div>
    ))}
  </>
);

interface BodyProps {
  section: HelpSection;
  layout: Breakpoint;
  onRestartWalkthrough?: () => void;
  onOpenShortcuts?: () => void;
}

const SectionBody: React.FC<BodyProps> = ({ section, layout, onRestartWalkthrough, onOpenShortcuts }) => {
  const touch = layout !== 'desktop';
  const stacked = layout !== 'desktop';
  const buttonHeight = touch ? 'h-11 px-3' : 'h-8 px-3';

  return (
    <>
      {section.id === 'standards' && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft p-3.5 text-[13px] leading-relaxed">
          <strong className="text-warning">Training aid.</strong> {STANDARDS_NOTICE}
        </div>
      )}
      {section.lead && (
        <p className="m-0 text-[13px] leading-relaxed text-ink-muted">
          <KeyText text={section.lead} />
        </p>
      )}

      {section.id === 'start' ? (
        <>
          <div className={`grid gap-3 ${layout === 'desktop' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {section.groups[0].rows.map((mode) => (
              <div key={mode.label} className="rounded-lg border border-border p-3">
                <div className="text-[13px] font-semibold">{mode.label}</div>
                <div className="mt-1 text-xs leading-normal text-ink-muted">{mode.text}</div>
              </div>
            ))}
          </div>
          <div className={EYEBROW}>{section.groups[1].title}</div>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
            {section.groups[1].rows.map((step, i) => (
              <li key={step.label} className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-mono text-xs font-medium">{i + 1}</span>
                <span>
                  <KeyText text={step.text} />
                </span>
              </li>
            ))}
          </ol>
          {onRestartWalkthrough && (
            <div className={`mt-auto flex gap-3 rounded-lg border border-border bg-surface-sunken px-3.5 py-3 ${stacked ? 'flex-col items-start' : 'items-center'}`}>
              <div className="flex-1">
                <div className="text-[13px] font-semibold">Want the guided version?</div>
                <div className="text-xs text-ink-muted">Six short steps, anchored to the real controls.</div>
              </div>
              <button type="button" onClick={onRestartWalkthrough} className={`${PRIMARY} ${buttonHeight}`}>
                Restart {WALKTHROUGH_STEPS.length}-Step Walkthrough
              </button>
            </div>
          )}
        </>
      ) : (
        <Rows section={section} stacked={stacked} />
      )}

      {section.id === 'controls' && onOpenShortcuts && (
        <div className="mt-auto">
          <button type="button" onClick={onOpenShortcuts} className={`${SECONDARY} ${buttonHeight}`}>
            Keyboard Shortcuts <Kbd><KeyText text="{panel.keybinds}" chips={false} /></Kbd>
          </button>
        </div>
      )}
      {section.id === 'wiring' && (
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <span className={TAG}>Desktop and tablet</span>
          <span className="text-xs text-ink-muted">Editing is off in the phone view.</span>
        </div>
      )}
    </>
  );
};

/**
 * Help > How to Use. Desktop: centred dialog with a section sidebar. Tablet: right drawer with section chips.
 * Phone: read-only full sheet with accordions.
 */
export const HelpPanel: React.FC<HelpPanelProps> = ({ layout, section, onSectionChange, onClose, onRestartWalkthrough, onOpenShortcuts }) => {
  const [query, setQuery] = useState('');
  const [openOnPhone, setOpenOnPhone] = useState<HelpSectionId | null>(section);
  const searchRef = useRef<HTMLInputElement>(null);
  const desktop = layout === 'desktop';
  const phone = layout === 'phone';
  const current = HELP_SECTIONS.find((s) => s.id === section) ?? HELP_SECTIONS[0];
  const q = query.trim();
  const results = q ? searchHelp(q) : [];
  // Editing help only: nothing on a phone can restart the guide or rebind keys
  const actions = phone ? {} : { onRestartWalkthrough, onOpenShortcuts };

  const goTo = (id: HelpSectionId) => {
    setQuery('');
    setOpenOnPhone(id);
    onSectionChange(id);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === '/' && (e.target as HTMLElement).tagName !== 'INPUT') {
      e.preventDefault();
      searchRef.current?.focus();
    } else if (onOpenShortcuts && !phone && matchesShortcutAction(e.nativeEvent, 'panel.keybinds')) {
      e.preventDefault();
      onOpenShortcuts();
    }
  };

  const search = (className: string) => (
    <label className={`flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-ink-muted focus-within:border-probe focus-within:shadow-focus ${className}`}>
      <Search className="h-4 w-4 shrink-0" />
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search help"
        aria-label="Search help"
        className="min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-muted focus:outline-none focus-visible:shadow-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {desktop && <Kbd>/</Kbd>}
    </label>
  );

  const searchResults = (
    <>
      {results.map((s) => (
        <section key={s.id} className="flex flex-col gap-2">
          <button type="button" onClick={() => goTo(s.id)} className="self-start rounded-sm text-left text-base font-normal hover:underline focus-visible:outline-none focus-visible:shadow-focus">
            <Match text={s.title} query={q} />
          </button>
          <Rows section={s} stacked={!desktop} query={q} />
        </section>
      ))}
      {results.length === 0 && (
        <div className="flex flex-col gap-2" role="status">
          <div className="text-[13px] font-semibold">No topics match "{q}"</div>
          <div className="text-xs text-ink-muted">Try a shorter word, or browse a section.</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => goTo('testing')} className={`${SECONDARY} px-3 ${desktop ? 'h-7' : 'h-11'}`}>
              Testing and analysis
            </button>
            <button type="button" onClick={() => setQuery('')} className={`${SECONDARY} px-3 ${desktop ? 'h-7' : 'h-11'}`}>
              Clear search
            </button>
          </div>
        </div>
      )}
    </>
  );

  const closeButton = (
    <button type="button" onClick={onClose} aria-label="Close help" className={`${ICON_BUTTON} ${desktop ? 'h-8 w-8' : 'h-11 w-11'}`}>
      <X className="h-4 w-4" />
    </button>
  );
  const title = (text: string, className: string) => (
    <h2 data-autofocus tabIndex={-1} className={`m-0 flex-1 font-semibold focus:outline-none focus-visible:shadow-none ${className}`}>
      {text}
    </h2>
  );

  return (
    <ModalShell
      label="How to Use WireWise"
      onDismiss={onClose}
      onKeyDown={handleKey}
      placement={desktop ? 'center' : phone ? 'full' : 'right'}
      panelClassName={
        desktop
          ? 'w-[840px] max-w-full h-[592px] max-h-full rounded-lg border border-border'
          : phone
          ? 'w-full h-full'
          : 'w-[440px] max-w-full h-full rounded-l-lg border-l border-border'
      }
    >
      {desktop ? (
        <>
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
            <CircleHelp className="h-4 w-4 shrink-0 text-ink-muted" />
            {title('How to Use WireWise', 'text-base')}
            {search('h-8 w-[260px]')}
            {closeButton}
          </header>
          <div className="flex min-h-0 flex-1">
            <nav aria-label="Help sections" className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface-sunken p-3">
              <div className={`${EYEBROW} px-2.5 pb-2 pt-1`}>Guide</div>
              {HELP_SECTIONS.map((s, i) => {
                const active = !q && s.id === current.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(s.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex h-9 w-full shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] focus-visible:outline-none focus-visible:shadow-focus ${
                      active ? 'bg-probe-soft font-semibold text-probe' : 'font-medium text-ink hover:bg-surface-hover'
                    }`}
                  >
                    <span className="font-mono text-[11px] opacity-80">{String(i + 1).padStart(2, '0')}</span>
                    {s.title}
                  </button>
                );
              })}
            </nav>
            <div key={q ? 'search' : current.id} className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto p-6 [&>*]:shrink-0">
              {q ? (
                searchResults
              ) : (
                <>
                  <h3 className="m-0 text-xl font-semibold leading-tight">{current.title}</h3>
                  <SectionBody section={current} layout={layout} {...actions} />
                </>
              )}
            </div>
          </div>
          <footer className="flex h-12 shrink-0 items-center gap-3 border-t border-border bg-surface-sunken px-4">
            <span className="flex-1 font-mono text-[11px] text-ink-muted">WireWise v{APP_VERSION}</span>
            <span className="text-xs text-ink-muted">
              <Kbd>Esc</Kbd> closes
            </span>
            <button type="button" onClick={onClose} className={`${SECONDARY} h-8 px-3`}>
              Close
            </button>
          </footer>
        </>
      ) : (
        <>
          <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border pl-3 pr-1">
            {title('How to Use', 'text-sm')}
            {closeButton}
          </header>
          <div className="shrink-0 px-3 pt-2 pb-2">{search('h-11 w-full')}</div>
          {!phone && (
            <nav aria-label="Help sections" className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3 pb-2">
              {HELP_SECTIONS.map((s) => {
                const active = !q && s.id === current.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(s.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`${BUTTON} h-11 shrink-0 px-3 ${
                      active ? 'border-probe bg-probe-soft font-semibold text-probe' : 'border-border-strong bg-surface text-ink'
                    }`}
                  >
                    {s.short}
                  </button>
                );
              })}
            </nav>
          )}
          <div key={q ? 'search' : phone ? 'phone' : current.id} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
            {q ? (
              searchResults
            ) : phone ? (
              <div>
                {HELP_SECTIONS.map((s, i) => {
                  const open = openOnPhone === s.id;
                  const Chevron = open ? ChevronDown : ChevronRight;
                  return (
                    <div key={s.id} className={i > 0 ? 'border-t border-border' : ''}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => {
                          setOpenOnPhone(open ? null : s.id);
                          onSectionChange(s.id);
                        }}
                        className="flex min-h-[44px] w-full items-center gap-2 text-left text-[13px] font-semibold focus-visible:outline-none focus-visible:shadow-focus"
                      >
                        {s.title}
                        {s.phoneTag && <span className={TAG}>{s.phoneTag}</span>}
                        <Chevron className="ml-auto h-4 w-4 shrink-0 text-ink-muted" />
                      </button>
                      {open && (
                        <div className="flex flex-col gap-3 pb-3">
                          <SectionBody section={s} layout={layout} {...actions} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <h3 className="m-0 text-base font-semibold">{current.title}</h3>
                <SectionBody section={current} layout={layout} {...actions} />
              </>
            )}
          </div>
        </>
      )}
    </ModalShell>
  );
};
