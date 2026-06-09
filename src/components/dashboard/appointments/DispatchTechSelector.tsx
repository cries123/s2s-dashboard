import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Wrench } from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  formatTechLabelWithCount,
  normalizeTechNumber,
  resolveTechDisplayName,
} from '../../../lib/dispatchTechRoster';
import type { PerformanceAdvisorSlot } from '../../../types';

interface DispatchTechSelectorProps {
  techNumber: string;
  roster: PerformanceAdvisorSlot[];
  techRoCounts: Map<string, number>;
  onSelect: (techId: string) => void;
  compact?: boolean;
  className?: string;
}

const MENU_MIN_WIDTH = 260;
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 8;

export function DispatchTechSelector({
  techNumber,
  roster,
  techRoCounts,
  onSelect,
  compact,
  className,
}: DispatchTechSelectorProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    const anchor = buttonRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const width = Math.max(rect.width, MENU_MIN_WIDTH);
    const menuHeight = roster.length * MENU_ITEM_HEIGHT + MENU_PADDING;
    const gap = 6;
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const placeAbove = menuHeight > spaceBelow && spaceAbove >= spaceBelow;

    const availableHeight = placeAbove ? spaceAbove - gap : spaceBelow - gap;
    const needsScroll = menuHeight > availableHeight;

    setMenuStyle({
      position: 'fixed',
      zIndex: 10000,
      left: Math.min(rect.left, window.innerWidth - width - viewportPadding),
      width,
      minWidth: width,
      top: placeAbove ? rect.top - gap : rect.bottom + gap,
      transform: placeAbove ? 'translateY(-100%)' : undefined,
      maxHeight: needsScroll ? Math.max(availableHeight, 320) : undefined,
      overflowY: needsScroll ? 'auto' : undefined,
    });
  }, [roster.length]);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const displayLabel = formatTechLabelWithCount(techNumber, roster, techRoCounts);

  const menu = open && menuStyle
    ? createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="rounded-lg border border-indigo-500/30 bg-slate-950 shadow-2xl shadow-black/60 py-1 animate-in fade-in zoom-in-95 duration-150"
          role="listbox"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {roster.map((row) => {
            const key = normalizeTechNumber(row.id);
            const count = techRoCounts.get(key) ?? 0;
            const isActive = normalizeTechNumber(techNumber) === key;
            return (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onSelect(row.id);
                  setOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-2.5 text-left text-[11px] hover:bg-indigo-500/15 transition-colors',
                  isActive && 'bg-indigo-500/10 text-indigo-200'
                )}
              >
                <span className="font-semibold text-slate-100 whitespace-nowrap">
                  {resolveTechDisplayName(row.id, roster)}
                  {count > 0 ? ` (${count})` : ''}
                </span>
                <span className="text-slate-500 block font-mono text-[10px] mt-0.5">#{row.id}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'w-full text-left rounded border transition-colors',
          compact
            ? 'px-1.5 py-1 bg-slate-950/40 border-slate-800/50 hover:border-indigo-500/40'
            : 'px-2 py-1.5 bg-slate-950/50 border-slate-800/60 hover:border-indigo-500/40 hover:bg-indigo-950/20'
        )}
      >
        <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-bold flex items-center gap-1">
          <Wrench size={9} className="text-indigo-400/80" />
          Assigned tech
        </span>
        <span className="text-slate-200 font-medium block mt-0.5 truncate flex items-center justify-between gap-1">
          <span className="truncate">{displayLabel}</span>
          <ChevronDown size={12} className={cn('shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {menu}
    </div>
  );
}
