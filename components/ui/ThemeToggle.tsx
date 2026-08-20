import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

interface ThemeToggleProps {
  className?: string;
  /** Hide the text labels and show icons only — useful in tight spaces (e.g. mobile top bar). */
  compact?: boolean;
}

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border p-1 transition-colors',
        className
      )}
      style={{
        backgroundColor: 'var(--color-surface-muted)',
        borderColor: 'var(--color-surface-border)',
      }}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full text-xs font-semibold transition-colors',
          compact ? 'p-1.5' : 'px-2.5 py-1.5',
          theme === 'light' ? 'bg-brand-primary text-white' : 'text-slate-500'
        )}
      >
        <Sun size={14} />
        {!compact && <span>Light</span>}
      </span>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full text-xs font-semibold transition-colors',
          compact ? 'p-1.5' : 'px-2.5 py-1.5',
          theme === 'dark' ? 'bg-brand-primary text-white' : 'text-slate-500'
        )}
      >
        <Moon size={14} />
        {!compact && <span>Dark</span>}
      </span>
    </button>
  );
}

export default ThemeToggle;
