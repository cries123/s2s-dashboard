import React, { useState } from 'react';
import {
  Phone,
  Monitor,
  Users,
  RotateCcw,
  Loader2,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import { usePreferences } from '../../context/PreferencesContext';
import {
  LandingTab,
  LanguageFilter,
  CrmDensity,
} from '../../types';
import { CONTACT_OUTCOMES } from '../../lib/contactOutcomes';
import { ThemeToggle } from '../ui/ThemeToggle';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { DealershipProfileField } from '../ui/DealershipProfileField';

interface SettingsPageProps {
  onNavigate: (tab: LandingTab) => void;
  onNotify: (msg: string, isError?: boolean) => void;
  currentDealershipId?: string;
  onDealershipChange?: (dealershipId: string) => void;
  /** When true, omit the page hero — parent supplies the section header. */
  embedded?: boolean;
}

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="card-base rounded-xl border border-white/5 overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-white/5 bg-slate-950/40">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/15 flex items-center justify-center shrink-0">
            <Icon size={18} className="text-brand-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white normal-case tracking-normal">{title}</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6 space-y-5">{children}</div>
    </section>
  );
}

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
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white normal-case tracking-wide">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors',
          checked ? 'bg-brand-primary border-brand-primary/50' : 'bg-slate-800 border-white/10',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'block h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold normal-case tracking-normal text-slate-500 mb-1.5 block">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SettingsPage({ onNavigate, onNotify, currentDealershipId, onDealershipChange, embedded = false }: SettingsPageProps) {
  const { user } = useAuth();
  const {
    preferences,
    saving,
    updateContactWorkflow,
    updateDashboardModules,
    updateCrmDisplay,
    resetPreferences,
  } = usePreferences();

  const [savedFlash, setSavedFlash] = useState(false);

  const wrapSave = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onNotify('Preferences saved.');
    } catch {
      onNotify('Could not save preferences. Check your connection and try again.', true);
    }
  };

  const saveToolbar = (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      {saving && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold normal-case text-slate-400">
          <Loader2 size={12} className="animate-spin" /> Saving
        </span>
      )}
      {savedFlash && !saving && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold normal-case text-emerald-400">
          <Check size={12} /> Saved
        </span>
      )}
      <button
        type="button"
        onClick={() =>
          wrapSave(async () => {
            await resetPreferences();
          })
        }
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold normal-case tracking-normal text-slate-300 disabled:opacity-50"
      >
        <RotateCcw size={12} />
        Reset defaults
      </button>
    </div>
  );

  return (
    <div className={cn('space-y-6 animate-in fade-in duration-300 w-full pb-8', embedded ? '' : 'max-w-3xl mx-auto slide-in-from-bottom-4')}>

      {!embedded ? (
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-surface-card p-6 sm:p-8 shadow-sm">
          <div className="absolute top-0 right-0 w-48 h-48 bg-brand-primary/10 blur-[60px] rounded-full pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <SlidersHorizontal size={16} className="text-brand-primary" />
                <span className="text-xs font-semibold normal-case tracking-[0.25em] text-brand-primary">
                  Your workspace
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-white tracking-tight">
                Preferences
              </h1>
              <p className="text-sm text-slate-400 mt-2">
                Tune contact logging, dashboard modules, and CRM display. Saved to your profile.
              </p>
            </div>
            {saveToolbar}
          </div>
        </div>
      ) : (
        saveToolbar
      )}

      <Section
        title="Display"
        description="Choose a light or dark workspace. Your choice is remembered on this device."
        icon={Monitor}
      >
        <ThemeToggle />
      </Section>
      <Section
        title="Organization profile"
        description="Your enrolled dealership group is locked unless you are a system administrator."
        icon={Monitor}
      >
        <DealershipProfileField
          user={user}
          value={currentDealershipId}
          onChange={(id) => onDealershipChange?.(id)}
        />
      </Section>

      <Section
        title="Contact workflow"
        description="Choose the defaults used when logging calls from the queue or customer directory."
        icon={Phone}
      >
        <SelectField
          label="Default contact outcome"
          value={preferences.contactWorkflow.defaultOutcome}
          onChange={(v) => wrapSave(() => updateContactWorkflow({ defaultOutcome: v }))}
          options={CONTACT_OUTCOMES.map((o) => ({ value: o, label: o }))}
          disabled={saving}
        />
        <ToggleRow
          label="Auto-check appointment set"
          description='When outcome is "Appointment Set", check the appointment box automatically.'
          checked={preferences.contactWorkflow.autoCheckAppointmentSet}
          onChange={(v) => wrapSave(() => updateContactWorkflow({ autoCheckAppointmentSet: v }))}
          disabled={saving}
        />
      </Section>

      <Section
        title="Dashboard modules"
        description="Hide sections you don't use to reduce clutter on Operations and navigation."
        icon={Monitor}
      >
        <div className="space-y-4 divide-y divide-white/5">
          <ToggleRow
            label="Operations KPI header"
            checked={preferences.dashboardModules.showOperationsKpis}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showOperationsKpis: v }))}
            disabled={saving}
          />
          <ToggleRow
            label="Month-end projections"
            checked={preferences.dashboardModules.showOperationsProjections}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showOperationsProjections: v }))}
            disabled={saving}
          />
          <ToggleRow
            label="Advisor performance"
            checked={preferences.dashboardModules.showAdvisorPerformance}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showAdvisorPerformance: v }))}
            disabled={saving}
          />
          <ToggleRow
            label="Technician efficiency"
            checked={preferences.dashboardModules.showTechEfficiency}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showTechEfficiency: v }))}
            disabled={saving}
          />
          <ToggleRow
            label="Archive tools"
            checked={preferences.dashboardModules.showArchiveTools}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showArchiveTools: v }))}
            disabled={saving}
          />
          <p className="text-xs font-semibold normal-case tracking-normal text-slate-600 pt-2">Navigation tabs</p>
          <ToggleRow
            label="Forecast tab"
            checked={preferences.dashboardModules.showForecastTab}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showForecastTab: v }))}
            disabled={saving}
          />
          <ToggleRow
            label="Sales performance tab"
            checked={preferences.dashboardModules.showSalesPerformanceTab}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showSalesPerformanceTab: v }))}
            disabled={saving}
          />
          <ToggleRow
            label="VIN search tab"
            checked={preferences.dashboardModules.showVinSearchTab}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showVinSearchTab: v }))}
            disabled={saving}
          />
          <ToggleRow
            label="Pot of Gold tab"
            checked={preferences.dashboardModules.showPotOfGoldTab}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showPotOfGoldTab: v }))}
            disabled={saving}
          />
        </div>
      </Section>

      <Section
        title="CRM directory"
        description="Card density, language filter, and whether to show alert customers first."
        icon={Users}
      >
        <div>
          <p className="text-xs font-semibold normal-case tracking-normal text-slate-500 mb-2">Card density</p>
          <div className="flex gap-2">
            {(['standard', 'compact'] as CrmDensity[]).map((d) => (
              <button
                key={d}
                type="button"
                disabled={saving}
                onClick={() => wrapSave(() => updateCrmDisplay({ density: d }))}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-xs font-semibold normal-case tracking-normal border transition-all',
                  preferences.crmDisplay.density === d
                    ? 'border-brand-primary/50 bg-brand-primary/10 text-brand-primary'
                    : 'border-white/5 text-slate-400 hover:border-white/15'
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <SelectField
          label="Default language filter"
          value={preferences.crmDisplay.defaultLanguageFilter}
          onChange={(v) =>
            wrapSave(() => updateCrmDisplay({ defaultLanguageFilter: v as LanguageFilter }))
          }
          options={[
            { value: 'all', label: 'All languages' },
            { value: 'english', label: 'English' },
            { value: 'spanish', label: 'Spanish' },
          ]}
          disabled={saving}
        />
        <ToggleRow
          label="Alerts-only default"
          description="When opening Directory, start filtered to customers with active service alerts."
          checked={preferences.crmDisplay.alertsOnlyDefault}
          onChange={(v) => wrapSave(() => updateCrmDisplay({ alertsOnlyDefault: v }))}
          disabled={saving}
        />
        <button
          type="button"
          onClick={() => onNavigate('search')}
          className="text-xs font-semibold normal-case tracking-normal text-brand-primary hover:underline"
        >
          Go to Directory →
        </button>
      </Section>

      <p className="text-xs text-slate-600 font-bold normal-case tracking-normal text-center">
        Preferences sync across devices · CRM search is saved locally on this browser
      </p>
    </div>
  );
}
