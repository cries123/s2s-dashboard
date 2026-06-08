import React from 'react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'card-base flex flex-col items-center justify-center text-center px-6 py-12',
        className
      )}
    >
      <h3 className="crm-section-title">{title}</h3>
      {description && (
        <p className="crm-label mt-2 max-w-md leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
