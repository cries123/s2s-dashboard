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
          <button type="button" onClick={action.onClick} className="link-text text-sm shrink-0 min-h-[36px] px-1">
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
        <p className={cn('text-sm font-semibold truncate', titleClassName ?? 'text-brand-primary')}>{title}</p>
        {subtitle ? <p className="crm-label mt-0.5 truncate">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0 text-right">{right}</div> : null}
      {chevron ? <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} /> : null}
    </button>
  );
}

/**
 * PBS sends names, vehicles and concerns in capitals ("RAMOS, CRYSTAL",
 * "2024 HYUNDAI TUCSON"). Shouting text is the fastest way to look unfinished.
 * Only rewrites strings that are mostly upper-case; anything typed normally is left alone.
 */
export function tidyCase(s: string | null | undefined, mode: 'title' | 'sentence' = 'title'): string {
  if (!s) return '';
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3 || letters !== letters.toUpperCase()) return s;
  const lower = s.toLowerCase();
  const KEEP = new Set(['ac', 'a/c', 'suv', 'awd', 'fwd', 'rwd', 'ev', 'vin', 'ro', 'gl', 'gls', 'sel', 'se', 'hev', 'phev', 'abs', 'tpms', 'cel']);
  if (mode === 'sentence') {
    return lower
      .replace(/[a-z][a-z'/]*/g, (w) => (KEEP.has(w) ? w.toUpperCase() : w))
      .replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
  }
  return lower.replace(/[a-z][a-z'/]*/g, (w) => (KEEP.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
}

/** "RAMOS, CRYSTAL" -> "Crystal Ramos". */
export function tidyPersonName(s: string | null | undefined): string {
  const t = tidyCase(s);
  const m = t.match(/^\s*([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : t;
}
