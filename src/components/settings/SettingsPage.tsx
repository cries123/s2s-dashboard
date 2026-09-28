import React, { useEffect, useState } from 'react';
import { Building2, LayoutGrid, Menu as MenuIcon, Palette, Phone, RotateCcw, Users } from 'lucide-react';
import { usePreferences } from '../../context/PreferencesContext';
import { useTheme } from '../../context/ThemeContext';
import { LandingTab, LanguageFilter, CrmDensity } from '../../types';
import { CONTACT_OUTCOMES } from '../../lib/contactOutcomes';
import { ThemeToggle } from '../ui/ThemeToggle';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { DealershipProfileField } from '../ui/DealershipProfileField';
import { PageHeader } from '../layout/PageHeader';
import { SettingsDetail, SettingsMenu, type SettingsMenuGroup } from '../ui/SettingsMenu';
import { DEALERSHIPS } from '../../constants';
import { shortDealershipName } from '../layout/DealershipSwitcher';

interface SettingsPageProps {
  onNavigate: (tab: LandingTab) => void;
  onNotify: (msg: string, isError?: boolean) => void;
  currentDealershipId?: string;
  onDealershipChange?: (dealershipId: string) => void;
  /** When true, omit the page header — the parent supplies it. */
  embedded?: boolean;
}

/** One switch as a list row: label and hint on the left, the switch on the right. */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="list-row">
      <div className="flex-1 min-w-0">
        <p className="text-sm">{label}</p>
        {description && <p className="crm-label mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-brand-primary' : '',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        )}
        style={checked ? undefined : { backgroundColor: 'var(--color-input-border)' }}
      >
        <span
          aria-hidden
          className={cn('block h-5 w-5 rounded-full shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0')}
          style={{ backgroundColor: '#fff' }}
        />
      </button>
    </div>
  );
}

/**
 * Personal settings, as a menu: each row shows its current value and opens its own
 * screen. Same controls as before; they were one long stack of cards.
 */
export function SettingsPage({ onNavigate, onNotify, currentDealershipId, onDealershipChange, embedded = false }: SettingsPageProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { preferences, saving, updateContactWorkflow, updateDashboardModules, updateCrmDisplay, resetPreferences } =
    usePreferences();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (open) window.scrollTo({ top: 0 });
  }, [open]);

  const wrapSave = async (fn: () => Promise<void>) => {
    try {
      await fn();
      onNotify('Saved');
    } catch {
      onNotify("Couldn't save. Check your connection and try again.", true);
    }
  };

  const mods = preferences.dashboardModules;
  const sectionsShown = [
    mods.showOperationsKpis,
    mods.showOperationsProjections,
    mods.showAdvisorPerformance,
    mods.showTechEfficiency,
    mods.showArchiveTools,
  ].filter(Boolean).length;
  const tabsShown = [mods.showForecastTab, mods.showSalesPerformanceTab, mods.showVinSearchTab, mods.showPotOfGoldTab].filter(
    Boolean
  ).length;
  const store = DEALERSHIPS.find((d) => d.id === currentDealershipId);

  const groups: SettingsMenuGroup[] = [
    {
      label: 'General',
      items: [
        { id: 'appearance', title: 'Appearance', icon: Palette, tone: 'blue', value: theme === 'dark' ? 'Dark' : 'Light' },
        { id: 'dealership', title: 'Dealership', icon: Building2, tone: 'blue', value: store ? shortDealershipName(store.name) : undefined },
      ],
    },
    {
      label: 'Workflow',
      items: [
        { id: 'contact', title: 'Call logging', icon: Phone, tone: 'violet', value: preferences.contactWorkflow.defaultOutcome },
        {
          id: 'directory',
          title: 'Customer directory',
          icon: Users,
          tone: 'violet',
          value: preferences.crmDisplay.density === 'compact' ? 'Compact' : 'Standard',
        },
      ],
    },
    {
      label: 'Dashboard',
      items: [
        { id: 'modules', title: 'Operations sections', icon: LayoutGrid, tone: 'teal', value: `${sectionsShown} of 5 shown` },
        { id: 'tabs', title: 'Menu items', icon: MenuIcon, tone: 'teal', value: `${tabsShown} of 4 shown` },
      ],
    },
  ];
  const current = groups.flatMap((g) => g.items).find((i) => i.id === open);

  if (current) {
    return (
      <div className={cn('w-full pb-8', !embedded && 'max-w-3xl mx-auto')}>
        <SettingsDetail backLabel={embedded ? 'Preferences' : 'Settings'} title={current.title} onBack={() => setOpen(null)}>
          {current.id === 'appearance' ? (
            <>
              <p className="crm-label">Remembered on this device.</p>
              <ThemeToggle />
            </>
          ) : null}

          {current.id === 'dealership' ? (
            <DealershipProfileField user={user} value={currentDealershipId} onChange={(id) => onDealershipChange?.(id)} />
          ) : null}

          {current.id === 'contact' ? (
            <>
              <div>
                <label className="input-label" htmlFor="pref-outcome">Default call outcome</label>
                <select
                  id="pref-outcome"
                  value={preferences.contactWorkflow.defaultOutcome}
                  onChange={(e) => wrapSave(() => updateContactWorkflow({ defaultOutcome: e.target.value }))}
                  disabled={saving}
                  className="input-field"
                >
                  {CONTACT_OUTCOMES.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="list-group">
                <ToggleRow
                  label="Tick 'appointment set' automatically"
                  description='When the outcome is "Appointment Set".'
                  checked={preferences.contactWorkflow.autoCheckAppointmentSet}
                  onChange={(v) => wrapSave(() => updateContactWorkflow({ autoCheckAppointmentSet: v }))}
                  disabled={saving}
                />
              </div>
            </>
          ) : null}

          {current.id === 'directory' ? (
            <>
              <div>
                <p className="input-label">Card size</p>
                <div className="grid grid-cols-2 rounded-md border overflow-hidden" style={{ borderColor: 'var(--color-input-border)' }} role="group">
                  {(['standard', 'compact'] as CrmDensity[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={saving}
                      aria-pressed={preferences.crmDisplay.density === d}
                      onClick={() => wrapSave(() => updateCrmDisplay({ density: d }))}
                      className={cn(
                        'py-2.5 text-sm font-semibold capitalize transition-colors',
                        preferences.crmDisplay.density === d ? 'bg-brand-primary text-white' : 'hover:bg-surface-hover'
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="input-label" htmlFor="pref-lang">Language shown by default</label>
                <select
                  id="pref-lang"
                  value={preferences.crmDisplay.defaultLanguageFilter}
                  onChange={(e) => wrapSave(() => updateCrmDisplay({ defaultLanguageFilter: e.target.value as LanguageFilter }))}
                  disabled={saving}
                  className="input-field"
                >
                  <option value="all">All languages</option>
                  <option value="english">English</option>
                  <option value="spanish">Spanish</option>
                </select>
              </div>
              <div className="list-group">
                <ToggleRow
                  label="Start with alert customers only"
                  description="The directory opens filtered to customers with a service alert."
                  checked={preferences.crmDisplay.alertsOnlyDefault}
                  onChange={(v) => wrapSave(() => updateCrmDisplay({ alertsOnlyDefault: v }))}
                  disabled={saving}
                />
              </div>
              <button type="button" onClick={() => onNavigate('search')} className="link-text text-sm">
                Open the directory
              </button>
            </>
          ) : null}

          {current.id === 'modules' ? (
            <>
              <p className="crm-label">Hide the Operations sections you don't use.</p>
              <div className="list-group">
                <ToggleRow label="Summary numbers" checked={mods.showOperationsKpis} onChange={(v) => wrapSave(() => updateDashboardModules({ showOperationsKpis: v }))} disabled={saving} />
                <ToggleRow label="Month-end projections" checked={mods.showOperationsProjections} onChange={(v) => wrapSave(() => updateDashboardModules({ showOperationsProjections: v }))} disabled={saving} />
                <ToggleRow label="Advisor performance" checked={mods.showAdvisorPerformance} onChange={(v) => wrapSave(() => updateDashboardModules({ showAdvisorPerformance: v }))} disabled={saving} />
                <ToggleRow label="Technician efficiency" checked={mods.showTechEfficiency} onChange={(v) => wrapSave(() => updateDashboardModules({ showTechEfficiency: v }))} disabled={saving} />
                <ToggleRow label="Past months" checked={mods.showArchiveTools} onChange={(v) => wrapSave(() => updateDashboardModules({ showArchiveTools: v }))} disabled={saving} />
              </div>
            </>
          ) : null}

          {current.id === 'tabs' ? (
            <>
              <p className="crm-label">Choose which pages appear in your menu.</p>
              <div className="list-group">
                <ToggleRow label="Forecast" checked={mods.showForecastTab} onChange={(v) => wrapSave(() => updateDashboardModules({ showForecastTab: v }))} disabled={saving} />
                <ToggleRow label="Sales performance" checked={mods.showSalesPerformanceTab} onChange={(v) => wrapSave(() => updateDashboardModules({ showSalesPerformanceTab: v }))} disabled={saving} />
                <ToggleRow label="VIN search" checked={mods.showVinSearchTab} onChange={(v) => wrapSave(() => updateDashboardModules({ showVinSearchTab: v }))} disabled={saving} />
                <ToggleRow label="Pot of Gold" checked={mods.showPotOfGoldTab} onChange={(v) => wrapSave(() => updateDashboardModules({ showPotOfGoldTab: v }))} disabled={saving} />
              </div>
            </>
          ) : null}
        </SettingsDetail>
      </div>
    );
  }

  return (
    <div className={cn('w-full pb-8 animate-fade-in', !embedded && 'max-w-3xl mx-auto')}>
      {!embedded ? <PageHeader title="Settings" description="Saved to your profile and synced across your devices." /> : null}

      <SettingsMenu groups={groups} onOpen={setOpen} />

      <div className="max-w-2xl mt-6">
        <div className="list-group">
          <button
            type="button"
            className="list-row justify-center text-sm font-semibold text-rose-500"
            disabled={saving}
            onClick={() => wrapSave(() => resetPreferences())}
          >
            <RotateCcw size={15} /> Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
