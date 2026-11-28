import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { TourAction, WALKTHROUGH_STEPS, WalkthroughStep } from '../../data/walkthroughSteps';
import { Box, Size, placeCoachmark, placeSheet } from '../../utils/coachmarkPlacement';
import { useKeybinds } from '../../utils/shortcuts';
import { plainKeyText } from '../../utils/keyText';
import { KeyText, Kbd } from './KeyText';

export type WalkthroughExit = 'skip' | 'labs' | 'wire';

interface WalkthroughProps {
  /** 0-based step */
  step: number;
  layout: 'desktop' | 'tablet';
  deviceCount: number;
  onStepChange: (step: number) => void;
  onClose: (reason: WalkthroughExit) => void;
  /** The card's secondary button: open a closed panel or switch view. Nothing opens by itself. */
  onAction: (action: TourAction) => void;
}

const CARD_WIDTH = 360;
const SWIPE_PX = 60;
const RING_OUTSET = 4;

interface Missing {
  message: string;
  action?: { id: TourAction; label: string; key?: string };
  /** Shortcut token shown after the message */
  hint?: string;
}

interface TourLayout {
  rings: Box[];
  obstacles: Box[];
  missing: Missing | null;
  viewport: Size;
  topInset: number;
  bottomInset: number;
}

/** The part of an element that is on screen, or null when it is hidden or absent */
function visibleBox(el: Element | null, within?: Box): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const bounds = within ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const left = Math.max(r.left, bounds.left);
  const top = Math.max(r.top, bounds.top);
  const width = Math.min(r.right, bounds.left + bounds.width) - left;
  const height = Math.min(r.bottom, bounds.top + bounds.height) - top;
  if (width < 1 || height < 1) return null;
  return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) };
}

const find = (selector: string) => visibleBox(document.querySelector(selector));
const tour = (name: string) => find(`[data-tour="${name}"]`);

/** On narrow screens the Library drawer covers the left of the canvas controls: ring only what shows */
function uncovered(box: Box, drawer: Box | null): Box {
  if (!drawer || box.top >= drawer.top + drawer.height || box.top + box.height <= drawer.top) return box;
  const edge = drawer.left + drawer.width;
  if (box.left < drawer.left || box.left >= edge || box.left + box.width <= edge) return box;
  return { ...box, left: edge + RING_OUTSET * 2, width: Math.max(1, box.left + box.width - edge - RING_OUTSET * 2) };
}

function measure(step: WalkthroughStep, deviceCount: number): TourLayout {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const header = tour('topbar');
  const statusbar = tour('statusbar');
  const obstacles = ['library-drawer', 'inspector', 'device-inspector', 'canvas-hud'].map(tour).filter((b): b is Box => !!b);
  const rings: Box[] = [];
  let missing: Missing | null = null;

  const panelClosed = !!step.panel && !find(step.panel.selector);
  if (step.panel && panelClosed) {
    const { message, action, actionLabel, actionKey } = step.panel;
    missing = { message, action: { id: action, label: actionLabel, key: `{${actionKey}}` } };
  }
  for (const choices of step.rings) {
    const selectors = step.panel && panelClosed ? choices.map((s) => (s === step.panel!.selector ? step.panel!.toggle : s)) : choices;
    for (const selector of selectors) {
      const box = find(selector);
      if (box) {
        rings.push(selector === '[data-tour="canvas-hud"]' ? uncovered(box, tour('library-drawer')) : box);
        break;
      }
    }
  }

  if (step.needsDevice) {
    const canvas = tour('canvas');
    if (deviceCount === 0) {
      missing = { message: 'Place a device first', hint: '{panel.library}' };
    } else if (!canvas) {
      missing = { message: 'Your devices are on the Realistic view.', action: { id: 'show-realistic', label: 'Open Realistic view', key: '{view.realistic}' } };
    } else {
      const drawer = tour('library-drawer');
      const nodes = Array.from(document.querySelectorAll('[data-tour="canvas"] [data-tour-device]'));
      // A device is a better example than a bare mounting rail
      nodes.sort((a, b) => Number(a.getAttribute('data-tour-device') === 'din_rail_track') - Number(b.getAttribute('data-tour-device') === 'din_rail_track'));
      const covered = (b: Box) => !!drawer && b.left < drawer.left + drawer.width && b.top < drawer.top + drawer.height;
      const device = nodes.map((n) => visibleBox(n, canvas)).find((b) => b && !covered(b));
      if (device) rings.push(device);
      else missing = { message: 'Your devices are off screen. Fit the drawing with', hint: '{canvas.fit}' };
    }
  }

  return {
    rings,
    obstacles,
    missing,
    viewport,
    topInset: (header ? header.top + header.height : 0) + 10,
    bottomInset: (statusbar ? viewport.height - statusbar.top : 0) + 10,
  };
}

/** Re-measures every frame, so rings follow resizes, banners, theme changes and dragged devices */
function useTourLayout(step: WalkthroughStep, deviceCount: number): TourLayout | null {
  const [layout, setLayout] = useState<TourLayout | null>(null);
  useEffect(() => {
    let frame = 0;
    let last = '';
    const tick = () => {
      const next = measure(step, deviceCount);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setLayout(next);
      }
      frame = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(frame);
  }, [step, deviceCount]);
  return layout;
}

const BUTTON = 'inline-flex items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium transition motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-focus';
const SECONDARY = `${BUTTON} border-border-strong bg-surface text-ink hover:bg-surface-hover`;
const PRIMARY = `${BUTTON} border-brand bg-brand text-on-brand font-semibold hover:bg-brand-strong hover:border-brand-strong active:shadow-none shadow-1`;

/**
 * Coachmark and spotlight. A non-modal dialog: the canvas behind stays live and single-key shortcuts keep
 * working. Desktop cards sit beside the ringed control; tablets get a bottom sheet.
 */
export const Walkthrough: React.FC<WalkthroughProps> = ({ step, layout, deviceCount, onStepChange, onClose, onAction }) => {
  const { getLabel } = useKeybinds();
  const content = WALKTHROUGH_STEPS[step];
  const total = WALKTHROUGH_STEPS.length;
  const tablet = layout === 'tablet';
  const isFirst = step === 0;
  const isLast = step === total - 1;
  const measured = useTourLayout(content, deviceCount);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const swipeStart = useRef<number | null>(null);

  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight ?? 0;
    if (height !== cardHeight) setCardHeight(height);
  });

  // Focus moves to the card when it opens and on each step. One frame later, so a closing menu cannot take it back.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => cardRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  const go = (next: number) => onStepChange(Math.min(total - 1, Math.max(0, next)));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key !== 'Escape' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // Only these three belong to the card; everything else reaches the app
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') onClose('skip');
    else go(step + (e.key === 'ArrowRight' ? 1 : -1));
  };

  let position: React.CSSProperties = { left: 12, top: 12, opacity: 0 };
  if (measured && cardHeight > 0) {
    if (tablet) {
      const sheet = placeSheet({
        viewport: measured.viewport,
        height: cardHeight,
        targets: measured.rings,
        topInset: measured.topInset,
        bottomInset: measured.bottomInset,
      });
      position = { left: sheet.left, right: sheet.right, top: sheet.top, bottom: sheet.bottom };
    } else {
      position = placeCoachmark({
        viewport: measured.viewport,
        card: { width: Math.min(CARD_WIDTH, measured.viewport.width * 0.9), height: cardHeight },
        targets: measured.rings,
        obstacles: measured.obstacles,
        minTop: measured.topInset,
      });
    }
  }

  const height = tablet ? 'h-11' : 'h-8';
  const missing = measured?.missing;

  return (
    <>
      {measured?.rings.map((ring, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="tour-ring"
          style={{ left: ring.left - RING_OUTSET, top: ring.top - RING_OUTSET, width: ring.width + RING_OUTSET * 2, height: ring.height + RING_OUTSET * 2 }}
        />
      ))}

      <div className="sr-only" aria-live="polite">
        Step {step + 1} of {total}, {plainKeyText(content.title, getLabel)}
      </div>

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label="New Installation Guide"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onTouchStart={(e) => {
          swipeStart.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (swipeStart.current === null) return;
          const dx = e.changedTouches[0].clientX - swipeStart.current;
          swipeStart.current = null;
          if (Math.abs(dx) >= SWIPE_PX) go(step + (dx < 0 ? 1 : -1));
        }}
        style={{ ...position, ...(tablet ? {} : { width: CARD_WIDTH }), maxHeight: `calc(100vh - ${(measured?.topInset ?? 0) + 12}px)` }}
        className={`fixed z-[35] flex flex-col gap-2.5 overflow-y-auto rounded-lg border border-border bg-surface p-4 text-ink shadow-2 select-none transition-[left,top] duration-200 ease-out motion-reduce:transition-none focus:outline-none focus-visible:shadow-2 [&>*]:shrink-0 ${
          tablet ? '' : 'max-w-[90vw]'
        }`}
      >
        <div className="flex items-center">
          <span className="flex-1 font-display text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Step {step + 1} of {total}
          </span>
          <button
            type="button"
            onClick={() => onClose('skip')}
            aria-label="Close walkthrough"
            className={`${BUTTON} border-transparent text-ink-muted hover:bg-surface-hover hover:text-ink ${tablet ? 'h-11 w-11' : 'h-7 w-7'}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="m-0 text-base font-semibold leading-snug">{content.title}</h2>
        <p className="m-0 text-[13px] leading-relaxed text-ink-muted">
          <KeyText text={content.body} chips={false} />
        </p>
        <div className="flex flex-wrap gap-1.5">
          {content.keys.map((key) => (
            <KeyText key={key} text={key} />
          ))}
        </div>
        {missing && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span>
              {missing.message} {missing.hint && <KeyText text={missing.hint} />}
            </span>
            {missing.action && (
              <button type="button" onClick={() => onAction(missing.action!.id)} className={`${SECONDARY} px-3 ${tablet ? 'h-11' : 'h-7'}`}>
                {missing.action.label}
                {missing.action.key && !tablet && (
                  <Kbd>
                    <KeyText text={missing.action.key} chips={false} />
                  </Kbd>
                )}
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 py-0.5" aria-hidden="true">
          {WALKTHROUGH_STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === step ? 'w-[18px] bg-probe' : i < step ? 'w-1.5 bg-border-strong' : 'w-1.5 bg-border'}`} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={isFirst}
            className={`${SECONDARY} px-3 ${height} ${tablet ? 'min-w-[88px]' : ''} disabled:cursor-default disabled:border-border disabled:text-ink-faint disabled:hover:bg-surface`}
          >
            Back
          </button>
          {!isLast && (
            <button
              type="button"
              onClick={() => onClose('skip')}
              className={`rounded-md px-1.5 text-[13px] font-medium text-ink-muted underline hover:text-ink focus-visible:outline-none focus-visible:shadow-focus ${height} ${tablet ? 'min-w-[44px]' : ''}`}
            >
              Skip
            </button>
          )}
          <span className="flex-1" />
          {isLast ? (
            <>
              <button type="button" onClick={() => onClose('labs')} className={`${SECONDARY} px-3 ${height}`}>
                Open Example Labs
              </button>
              <button type="button" onClick={() => onClose('wire')} className={`${PRIMARY} px-3 ${height}`}>
                Start Wiring
              </button>
            </>
          ) : (
            <button type="button" onClick={() => go(step + 1)} className={`${PRIMARY} px-3 ${height}`}>
              Next Step
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
};
