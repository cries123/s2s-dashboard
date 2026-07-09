import React from 'react';
import { cn } from '../../lib/utils';

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md', className)}
      style={{ backgroundColor: 'var(--color-surface-muted)' }}
    />
  );
}

export function KpiStripSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-base px-4 py-3 space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn('card-base overflow-hidden p-4 space-y-3', className)}>
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: cols }).map((_, col) => (
            <SkeletonBlock key={col} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('card-base p-6 space-y-4', className)}>
      <SkeletonBlock className="h-4 w-40" />
      <SkeletonBlock className="h-8 w-full" />
      <SkeletonBlock className="h-24 w-full" />
    </div>
  );
}

export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6 animate-fade-in', className)}>
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="h-4 w-72 max-w-full" />
      </div>
      <KpiStripSkeleton />
      <CardSkeleton />
    </div>
  );
}
