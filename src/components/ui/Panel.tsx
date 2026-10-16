import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

type Tone = 'blue' | 'violet' | 'teal' | 'amber' | 'rose' | 'slate';

const TILE: Record<Tone, { bg: string; fg: string }> = {
  blue: { bg: '#d8edff', fg: '#014486' },
  violet: { bg: '#ece1f9', fg: '#5a1ba9' },
  teal: { bg: '#def9f3', fg: '#056764' },
  amber: { bg: '#fff3d6', fg: '#8c4b02' },
  rose: { bg: '#fddde3', fg: '#ba0517' },
  slate: { bg: '#f3f3f3', fg: '#3e4955' },
};

/**
 * A white panel with a title row: small icon tile, title, and an optional link on
 * the right ("View all"). The standard container for a list or a group of numbers.
 */
export function Panel({
  title,
  icon: Icon,
  tone = 'blue',
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon?: React.ComponentType<{ size?: number }>;
  tone?: Tone;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('card-base overflow-hidden', className)}>
      <header className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: 'var(--color-row-divider)' }}>
        {Icon ? (
          <span
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: TILE[tone].bg, color: TILE[tone].fg }}
            aria-hidden="true"
          >
            <Icon size={15} />
          </span>
        ) : null}
        <h2 className="flex-1 min-w-0 text-sm font-semibold truncate">{title}</h2>
        {action ? (
          <button type="button" onClick={action.onClick} className="link-text text-sm shrink-0 min-h-[44px] px-1">
            {action.label}
          </button>
        ) : null}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A tappable row inside a Panel or list-group: main text, secondary line, optional right side, chevron. */
export function ListRowButton({
  title,
  subtitle,
  right,
  onClick,
  titleClassName,
  chevron = true,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  onClick: () => void;
  titleClassName?: string;
  chevron?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className="list-row">
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold', titleClassName ?? 'text-brand-primary truncate')}>{title}</p>
        {subtitle ? <p className="crm-label mt-0.5 truncate">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0 text-right">{right}</div> : null}
      {chevron ? <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} /> : null}
    </button>
  );
}

// Moved to lib so plain helpers can use it; re-exported so existing imports keep working.
export { tidyCase, tidyPersonName } from '../../lib/tidyCase';
