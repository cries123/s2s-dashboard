import React, { createContext, useContext, useEffect, useMemo } from 'react';

export type ThemeMode = 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.colorScheme = 'dark';
    try {
      localStorage.removeItem('s2s-theme');
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ theme: 'dark' as const }), []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
