import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export type NoticeTone = 'warn' | 'info' | 'good';

const TONES: Record<NoticeTone, { chip: string; body: string; Icon: React.ElementType }> = {
  warn: {
    chip: 'border-amber-500/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15',
    body: 'text-amber-200/80',
    Icon: AlertTriangle,
  },
  good: {
    chip: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15',
    body: 'text-emerald-200/80',
    Icon: CheckCircle2,
  },
  info: {
    chip: 'border-white/10 bg-white/[0.04] text-text-secondary hover:bg-white/[0.07]',
    body: 'text-text-secondary',
    Icon: Info,
  },
};

interface CardNoticeProps {
  tone?: NoticeTone;
  /** The short line. On a phone this is all that shows until the notice is opened. */
  summary: string;
  /** The long explanation. Hidden until tapped; omit it and the chip is just a label. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * A one-line status chip that opens to reveal the detail.
 *
 * These cards used to stack three or four explanatory paragraphs above the numbers,
 * which on a phone pushed the actual data off screen. The explanation still matters
 * the first time someone hits it, so it is kept — one tap away instead of always on.
 */
export function CardNotice({ tone = 'info', summary, children, className }: CardNoticeProps) {
  const { chip, body, Icon } = TONES[tone];

  if (!children) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
          chip,
          className
        )}
      >
        <Icon size={12} className="shrink-0" />
        {summary}
      </span>
    );
  }

  return (
    <details className={cn('group min-w-0', className)}>
      <summary
        className={cn(
          'inline-flex max-w-full cursor-pointer list-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors [&::-webkit-details-marker]:hidden',
          chip
        )}
      >
        <Icon size={12} className="shrink-0" />
        <span className="truncate">{summary}</span>
        <ChevronDown size={12} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <p className={cn('mt-2 max-w-2xl text-xs leading-relaxed', body)}>{children}</p>
    </details>
  );
}

/** Wraps a set of notices so they flow across the width instead of stacking. */
export function CardNoticeRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex flex-wrap items-start gap-2', className)}>{children}</div>;
}

/** The quiet one-line "where these numbers came from" text under a card title. */
export function CardMeta({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('crm-label mt-0.5 truncate', className)}>{children}</p>;
}
