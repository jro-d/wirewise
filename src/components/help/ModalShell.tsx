import React, { useEffect, useRef } from 'react';

export type DismissReason = 'close' | 'escape' | 'scrim';

interface ModalShellProps {
  label: string;
  onDismiss: (reason: DismissReason) => void;
  children: React.ReactNode;
  /** Positioning of the panel inside the scrim */
  placement?: 'center' | 'right' | 'full';
  panelClassName?: string;
  /** Keys typed inside the dialog, before they are stopped from reaching the app */
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const PLACEMENT: Record<NonNullable<ModalShellProps['placement']>, string> = {
  center: 'items-center justify-center p-4',
  right: 'items-stretch justify-end',
  full: 'items-stretch justify-stretch',
};

/**
 * Modal dialog: scrim, focus trap, Esc and scrim click to close, focus back to the trigger afterwards.
 * Focus starts on the element marked data-autofocus (the title). App shortcuts do not fire while it is open.
 */
export const ModalShell: React.FC<ModalShellProps> = ({ label, onDismiss, children, placement = 'center', panelClassName = '', onKeyDown }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    let returnTo: HTMLElement | null = null;
    // One frame later: a menu that opened this dialog has handed focus back to its trigger by then
    const raf = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      if (!panel.contains(document.activeElement)) returnTo = document.activeElement as HTMLElement | null;
      (panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel).focus();
    });

    const onWindowKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismissRef.current('escape');
        return;
      }
      const inside = panel.contains(e.target as Node);
      if (e.key === 'F1') e.preventDefault();
      if (e.key === 'Tab') {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!first) {
          e.preventDefault();
        } else if (!inside || (e.shiftKey && (active === first || !items.includes(active!)))) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
      // Focus can fall to the page when a focused button disappears: keep those keys away from the app too
      if (!inside) e.stopPropagation();
    };
    window.addEventListener('keydown', onWindowKey, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onWindowKey, true);
      const target = returnTo;
      if (target?.isConnected) window.requestAnimationFrame(() => target.focus());
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-console/45 select-none ${PLACEMENT[placement]}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismissRef.current('scrim');
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          e.stopPropagation();
        }}
        className={`bg-surface text-ink flex flex-col overflow-hidden shadow-2 focus:outline-none focus-visible:shadow-2 ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
