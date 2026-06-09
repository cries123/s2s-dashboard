import React from 'react';
import { Calendar, MessageSquare, Wrench } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { EmptyState } from '../../ui/EmptyState';

export type TimelineEventType = 'service' | 'contact' | 'campaign';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  date: Date;
  title: string;
  subtitle?: string;
  body?: string;
  meta?: string;
}

interface CustomerTimelineProps {
  events: TimelineEvent[];
  loading?: boolean;
  className?: string;
}

const typeStyles: Record<TimelineEventType, { icon: typeof Wrench; badge: string }> = {
  service: { icon: Wrench, badge: 'badge-info' },
  contact: { icon: MessageSquare, badge: 'badge-success' },
  campaign: { icon: Calendar, badge: 'badge-warning' },
};

function formatEventDate(date: Date) {
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CustomerTimeline({ events, loading, className }: CustomerTimelineProps) {
  if (loading) {
    return (
      <div className={cn('space-y-4', className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card-base p-4 animate-pulse space-y-2">
            <div className="h-3 w-24 rounded bg-slate-800" />
            <div className="h-4 w-full rounded bg-slate-800" />
            <div className="h-12 w-full rounded bg-slate-800" />
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Service visits and staff contact logs will appear here in chronological order."
      />
    );
  }

  const sorted = [...events].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className={cn('relative border-l pl-5 ml-2 space-y-4', className)} style={{ borderColor: 'var(--color-surface-border)' }}>
      {sorted.map((event) => {
        const { icon: Icon, badge } = typeStyles[event.type];
        return (
          <div key={event.id} className="relative card-base p-4">
            <div className="absolute -left-[calc(1.25rem+1px)] top-5 w-3 h-3 rounded-full border-2 border-brand-primary bg-slate-950" />
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={cn('badge text-[10px]', badge)}>{event.type}</span>
              <span className="crm-label flex items-center gap-1">
                <Icon size={12} />
                {formatEventDate(event.date)}
              </span>
              {event.subtitle && <span className="crm-label">· {event.subtitle}</span>}
            </div>
            <p className="text-sm font-medium">{event.title}</p>
            {event.body && (
              <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {event.body}
              </p>
            )}
            {event.meta && <p className="crm-label mt-2">{event.meta}</p>}
          </div>
        );
      })}
    </div>
  );
}
