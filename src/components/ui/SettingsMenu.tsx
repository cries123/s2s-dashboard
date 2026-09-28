import React, { createContext, useContext } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Settings as a menu, the way phone settings and corporate admin consoles work:
 * a short grouped list where each row shows its current value, and tapping a row
 * opens that one setting on its own screen. It replaced a single 7,000px page.
 *
 * Existing settings blocks don't have to be rewritten to live here: wrap each one
 * in <SettingsGate id="…">, and render the whole set inside <SettingsOnly id>.
 * Only the chosen block shows; the rest render nothing.
 */

/** undefined = no menu in effect (show everything), otherwise the one id to show. */
const SettingsOnlyContext = createContext<string | undefined>(undefined);

export function SettingsOnly({ id, children }: { id: string; children: React.ReactNode }) {
  return <SettingsOnlyContext.Provider value={id}>{children}</SettingsOnlyContext.Provider>;
}

export function SettingsGate({ id, children }: { id: string | string[]; children: React.ReactNode }) {
  const only = useContext(SettingsOnlyContext);
  if (only === undefined) return <>{children}</>;
  const ids = Array.isArray(id) ? id : [id];
  return ids.includes(only) ? <>{children}</> : null;
}

/** True when rendering inside a single-setting screen; lets blocks drop their own headings. */
export function useInSettingsDetail(): boolean {
  return useContext(SettingsOnlyContext) !== undefined;
}

export type SettingsTone = 'blue' | 'violet' | 'teal' | 'amber' | 'rose' | 'slate';

const TONE_TILE: Record<SettingsTone, { bg: string; fg: string }> = {
  blue: { bg: '#d8edff', fg: '#014486' },
  violet: { bg: '#ece1f9', fg: '#5a1ba9' },
  teal: { bg: '#def9f3', fg: '#056764' },
  amber: { bg: '#fff3d6', fg: '#8c4b02' },
  rose: { bg: '#fddde3', fg: '#ba0517' },
  slate: { bg: '#f3f3f3', fg: '#3e4955' },
};

export interface SettingsMenuItem {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  /** The current value, shown at the right of the row ("Standard", "2 hrs", "Off"). */
  value?: string;
  tone?: SettingsTone;
  hidden?: boolean;
}

export interface SettingsMenuGroup {
  label: string;
  items: SettingsMenuItem[];
}

export function SettingsMenu({
  groups,
  onOpen,
  className,
}: {
  groups: SettingsMenuGroup[];
  onOpen: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('max-w-2xl', className)}>
      {groups.map((group) => {
        const items = group.items.filter((i) => !i.hidden);
        if (!items.length) return null;
        return (
          <section key={group.label} aria-label={group.label}>
            <h2 className="list-group-label">{group.label}</h2>
            <div className="list-group">
              {items.map(({ id, title, icon: Icon, value, tone = 'slate' }) => (
                <button key={id} type="button" className="list-row" onClick={() => onOpen(id)}>
                  <span
                    className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: TONE_TILE[tone].bg, color: TONE_TILE[tone].fg }}
                    aria-hidden="true"
                  >
                    <Icon size={16} />
                  </span>
                  <span className="flex-1 min-w-0 text-sm truncate">{title}</span>
                  {value ? (
                    <span className="text-sm truncate max-w-[45%]" style={{ color: 'var(--color-text-secondary)' }}>
                      {value}
                    </span>
                  ) : null}
                  <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** The screen for one setting: a back link to the menu, the title, then the controls. */
export function SettingsDetail({
  backLabel,
  title,
  description,
  onBack,
  children,
}: {
  backLabel: string;
  title: string;
  description?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl space-y-4 animate-fade-in">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="link-text text-sm inline-flex items-center gap-0.5 -ml-1.5 min-h-[44px] px-1"
        >
          <ChevronLeft size={18} /> {backLabel}
        </button>
        <h1 className="crm-page-title">{title}</h1>
        {description ? <p className="crm-label mt-1">{description}</p> : null}
      </div>
      {/* :empty hides blocks whose settings all live on other screens. */}
      <div className="card-base p-4 sm:p-5 space-y-4 [&>*:empty]:hidden">{children}</div>
    </div>
  );
}
