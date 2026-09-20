import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

/** Personal appearance control, shared by all workspace views. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const options: Array<{ id: 'dark' | 'light'; label: string; icon: typeof Sun }> = [
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'light', label: 'Light', icon: Sun },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn('inline-flex rounded-lg border p-1 gap-1', className)}
      style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-base)' }}
    >
      {options.map(({ id, label, icon: Icon }) => {
        const selected = theme === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(id)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px]',
              selected ? 'bg-brand-primary text-white' : 'hover:bg-[var(--color-surface-hover)]'
            )}
            style={selected ? undefined : { color: 'var(--color-text-secondary)' }}
          >
            <Icon size={15} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
