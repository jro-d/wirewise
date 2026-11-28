import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip } from './Tooltip';

export type MenuEntry =
  | {
      kind?: 'item';
      id: string;
      label: string;
      icon?: React.ComponentType<{ className?: string }>;
      shortcut?: string;
      onSelect?: () => void;
      disabled?: boolean;
      active?: boolean;
      danger?: boolean;
      /** Muted text after the label */
      note?: string;
      /** Small mono chip on the right, e.g. a version number */
      badge?: string;
    }
  | {
      kind: 'submenu';
      id: string;
      label: string;
      icon?: React.ComponentType<{ className?: string }>;
      items: MenuEntry[];
    }
  | {
      kind: 'divider';
      id: string;
    }
  | {
      kind: 'header';
      id: string;
      label: string;
    }
  | {
      /** Quiet line at the bottom of a menu that is still clickable */
      kind: 'footer';
      id: string;
      label: string;
      onSelect: () => void;
    };

export interface MenuButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  text?: string;
  items: MenuEntry[];
  size?: 'md' | 'touch';
  align?: 'left' | 'right';
  disabled?: boolean;
  showChevron?: boolean;
  /** Marks the trigger as a walkthrough target */
  dataTour?: string;
  /** Trigger tone while the menu is open */
  openTone?: 'neutral' | 'probe';
  /** 6 px brand dot on the trigger */
  dot?: boolean;
  panelClassName?: string;
  /** Long menus: scroll inside the viewport and open submenus in place */
  scrollable?: boolean;
  /** Phone: show the menu as a bottom sheet */
  sheet?: boolean;
}

function getFocusableMenuItems(container: HTMLElement | null): HTMLButtonElement[] {
  if (!container) return [];
  const all = Array.from(container.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]'));
  return all.filter((el) => !el.disabled);
}

export const MenuButton: React.FC<MenuButtonProps> = ({
  icon: Icon,
  label,
  text,
  items,
  size = 'md',
  align = 'left',
  disabled = false,
  showChevron = false,
  dataTour,
  openTone = 'neutral',
  dot = false,
  panelClassName = '',
  scrollable = false,
  sheet = false,
}) => {
  const inlineSubmenus = scrollable || sheet;
  const [open, setOpen] = useState(false);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setOpenSubmenuId(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (openSubmenuId) {
          const prevSubId = openSubmenuId;
          setOpenSubmenuId(null);
          window.requestAnimationFrame(() => {
            const trigger = menuRef.current?.querySelector<HTMLButtonElement>(`[data-menu-id="${prevSubId}"]`);
            trigger?.focus();
          });
        } else {
          closeMenu(true);
        }
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, openSubmenuId]);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      const focusables = getFocusableMenuItems(menuRef.current);
      focusables[0]?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!openSubmenuId) return;
    const raf = window.requestAnimationFrame(() => {
      const focusables = getFocusableMenuItems(submenuRef.current);
      focusables[0]?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [openSubmenuId]);

  const handleMenuKeyDown = (container: HTMLDivElement | null, e: React.KeyboardEvent, isSub = false) => {
    const focusables = getFocusableMenuItems(container);
    if (focusables.length === 0) return;
    const activeEl = document.activeElement as HTMLButtonElement | null;
    const currentIndex = activeEl ? focusables.indexOf(activeEl) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = focusables[(currentIndex + 1) % focusables.length];
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = focusables[(currentIndex - 1 + focusables.length) % focusables.length];
      prev?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusables[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      focusables[focusables.length - 1]?.focus();
    } else if (isSub && e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevSubId = openSubmenuId;
      setOpenSubmenuId(null);
      window.requestAnimationFrame(() => {
        if (prevSubId) {
          menuRef.current?.querySelector<HTMLButtonElement>(`[data-menu-id="${prevSubId}"]`)?.focus();
        }
      });
    }
  };

  const sizeClass = size === 'touch' ? 'h-11 min-w-[44px] px-2.5' : 'h-8 min-w-[32px] px-2';
  const itemHeightClass = size === 'touch' ? 'min-h-[44px]' : 'min-h-[34px]';
  const openClass =
    openTone === 'probe' ? 'bg-probe-soft border-probe-soft text-probe shadow-1' : 'bg-surface-hover border-border-strong text-ink shadow-1';

  const renderEntry = (entry: MenuEntry, containerRef: React.RefObject<HTMLDivElement | null>, isSub = false) => {
    if (entry.kind === 'divider') {
      return <div key={entry.id} role="separator" className="my-1 border-t border-border" />;
    }
    if (entry.kind === 'header') {
      return (
        <div
          key={entry.id}
          className="px-3 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.08em] text-ink-muted"
        >
          {entry.label}
        </div>
      );
    }
    if (entry.kind === 'footer') {
      return (
        <button
          key={entry.id}
          type="button"
          role="menuitem"
          onClick={() => {
            closeMenu(true);
            entry.onSelect();
          }}
          className={`mt-1 w-full border-t border-border px-3 pt-1.5 pb-0.5 text-left font-mono text-[11px] text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:bg-surface-hover ${
            size === 'touch' ? 'min-h-[44px]' : 'min-h-[28px]'
          }`}
        >
          {entry.label}
        </button>
      );
    }
    if (entry.kind === 'submenu') {
      const SubIcon = entry.icon;
      const isSubOpen = openSubmenuId === entry.id;
      const submenuSideClass = align === 'right' ? 'right-full top-0 mr-1' : 'left-full top-0 ml-1';
      return (
        <div
          key={entry.id}
          className="relative"
          onMouseEnter={inlineSubmenus ? undefined : () => setOpenSubmenuId(entry.id)}
          onMouseLeave={inlineSubmenus ? undefined : () => setOpenSubmenuId((curr) => (curr === entry.id ? null : curr))}
        >
          <button
            type="button"
            role="menuitem"
            data-menu-id={entry.id}
            aria-haspopup="menu"
            aria-expanded={isSubOpen}
            onClick={() => setOpenSubmenuId((curr) => (curr === entry.id ? null : entry.id))}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpenSubmenuId(entry.id);
              }
            }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs font-medium text-ink hover:bg-surface-hover focus-visible:outline-none focus-visible:bg-surface-hover ${itemHeightClass}`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {!inlineSubmenus && align === 'right' && <ChevronLeft className="w-3.5 h-3.5 text-ink-muted shrink-0" />}
              {SubIcon && <SubIcon className="w-4 h-4 text-ink-muted shrink-0" />}
              <span className="truncate">{entry.label}</span>
            </span>
            {!inlineSubmenus && align === 'left' && <ChevronRight className="w-3.5 h-3.5 text-ink-muted shrink-0" />}
            {inlineSubmenus && (
              <ChevronDown className={`w-3.5 h-3.5 text-ink-muted shrink-0 ${isSubOpen ? 'rotate-180' : ''}`} />
            )}
          </button>
          {isSubOpen && (
            <div
              ref={submenuRef}
              role="menu"
              aria-label={entry.label}
              onKeyDown={(e) => handleMenuKeyDown(submenuRef.current, e, true)}
              className={
                inlineSubmenus
                  ? 'ml-4 border-l border-border'
                  : `absolute ${submenuSideClass} z-50 min-w-[220px] rounded-md border border-border bg-surface py-1 shadow-2`
              }
            >
              {entry.items.map((sub) => renderEntry(sub, submenuRef, true))}
            </div>
          )}
        </div>
      );
    }

    const ItemIcon = entry.icon;
    return (
      <button
        key={entry.id}
        type="button"
        role="menuitem"
        disabled={entry.disabled}
        onClick={() => {
          if (entry.disabled) return;
          closeMenu(true);
          entry.onSelect?.();
        }}
        onKeyDown={(e) => {
          if (!isSub && e.key === 'ArrowRight') {
            handleMenuKeyDown(containerRef.current, e, false);
          }
        }}
        className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition motion-reduce:transition-none focus-visible:outline-none ${itemHeightClass} ${
          entry.disabled
            ? 'text-ink-faint cursor-not-allowed'
            : entry.active
            ? 'bg-probe-soft text-probe font-semibold hover:bg-probe-soft'
            : entry.danger
            ? 'text-danger font-medium hover:bg-danger-soft focus-visible:bg-danger-soft'
            : 'text-ink font-medium hover:bg-surface-hover focus-visible:bg-surface-hover'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {ItemIcon ? (
            <ItemIcon className="w-4 h-4 shrink-0" />
          ) : (
            <span className="w-4 h-4 shrink-0 flex items-center justify-center">
              {entry.active ? <Check className="w-3.5 h-3.5" /> : null}
            </span>
          )}
          <span className="truncate">
            {entry.label}
            {entry.note && <span className="font-normal text-ink-muted"> {entry.note}</span>}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {entry.badge && (
            <span className="rounded-sm bg-brand-soft px-1.5 py-px font-mono text-[11px] font-medium text-brand-ink">{entry.badge}</span>
          )}
          {entry.shortcut && (
            <kbd className="rounded-xs border border-border bg-surface-sunken px-1 py-px font-mono text-[10px] text-ink-muted">
              {entry.shortcut}
            </kbd>
          )}
          {ItemIcon && entry.active && <Check className="w-3.5 h-3.5 shrink-0" />}
        </span>
      </button>
    );
  };

  return (
    <div ref={wrapperRef} className="relative inline-flex shrink-0">
      <Tooltip label={label} disabled={open} align={align === 'right' ? 'right' : 'center'}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          data-tour={dataTour}
          onClick={() => setOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={`relative flex items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition motion-reduce:transition-none shrink-0 focus-visible:outline-none focus-visible:shadow-focus ${sizeClass} ${
            disabled
              ? 'bg-transparent border-transparent text-ink-faint cursor-not-allowed'
              : open
              ? openClass
              : 'bg-surface border-border text-ink hover:bg-surface-hover hover:border-border-strong shadow-1'
          }`}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {text && <span className="truncate max-w-[90px]">{text}</span>}
          {showChevron && <ChevronDown className="w-3.5 h-3.5 text-ink-muted shrink-0" />}
          {dot && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" />}
        </button>
      </Tooltip>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => handleMenuKeyDown(menuRef.current, e, false)}
          className={
            sheet
              ? `fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-lg border-t border-border bg-surface pb-3 pt-2 shadow-2 ${panelClassName}`
              : `absolute top-full mt-1.5 ${align === 'right' ? 'right-0' : 'left-0'} z-50 min-w-[230px] rounded-md border border-border bg-surface py-1 shadow-2 ${
                  scrollable ? 'max-h-[calc(100vh-72px)] overflow-y-auto' : ''
                } ${panelClassName}`
          }
        >
          {sheet && <div aria-hidden="true" className="mx-auto mb-2 h-1 w-8 rounded-sm bg-border" />}
          {items.map((entry) => renderEntry(entry, menuRef, false))}
        </div>
      )}
    </div>
  );
};
