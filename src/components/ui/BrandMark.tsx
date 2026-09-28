import React from 'react';
import { cn } from '../../lib/utils';

/**
 * The product's own mark: two arrows closing a loop — a sale turning into a
 * service visit and back. Replaces the stock "layout" glyph the login screen
 * used, which was also the Home tab icon, so the product had no identity of
 * its own. Flat, no glow; reads at 20px and at 56px.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="S2S Dashboard"
      className={cn('shrink-0', className)}
    >
      <rect width="32" height="32" rx="7" fill="var(--color-brand-primary)" />
      <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {/* upper arc, left to right, arrowhead at the right */}
        <path d="M8.5 14.5a7.5 7.5 0 0 1 13.7-3.6" />
        <path d="M22.9 7.4l-.6 3.8-3.8-.7" />
        {/* lower arc, right to left, arrowhead at the left */}
        <path d="M23.5 17.5a7.5 7.5 0 0 1-13.7 3.6" />
        <path d="M9.1 24.6l.6-3.8 3.8.7" />
      </g>
    </svg>
  );
}

/** Mark plus the product name, for places the product introduces itself. */
export function BrandLockup({
  size = 28,
  className,
  tagline,
}: {
  size?: number;
  className?: string;
  tagline?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      <span className="flex flex-col leading-tight">
        <span className="font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          S2S Dashboard
        </span>
        {tagline && <span className="crm-label">{tagline}</span>}
      </span>
    </span>
  );
}
