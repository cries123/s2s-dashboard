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
import { clampFollowUpDays } from '../../lib/userPreferencesDefaults';
import { cn } from '../../lib/utils';

interface SettingsPageProps {
  onNavigate: (tab: LandingTab) => void;
  onNotify: (msg: string, isError?: boolean) => void;
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
    <section className="card-base rounded-3xl border border-white/5 overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-white/5 bg-slate-950/40">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/15 flex items-center justify-center shrink-0">
            <Icon size={18} className="text-brand-primary" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">{title}</h2>
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
    <label className="flex items-start justify-between gap-4 cursor-pointer group">
      <div className="min-w-0">
        <p className="text-[11px] font-black text-white uppercase tracking-wide">{label}</p>
        {description && <p className="text-[10px] text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-11 h-6 rounded-full shrink-0 transition-colors border',
          checked ? 'bg-brand-primary border-brand-primary/50' : 'bg-slate-800 border-white/10',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
    </label>
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
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
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

export function SettingsPage({ onNavigate, onNotify }: SettingsPageProps) {
  const {
    preferences,
    saving,
    updateContactWorkflow,
    updateDashboardModules,
    updateCrmDisplay,
    resetPreferences,
  } = usePreferences();

  const [followUpDraft, setFollowUpDraft] = useState(String(preferences.contactWorkflow.followUpDays));
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto pb-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-brand-primary/10 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-brand-primary/10 blur-[60px] rounded-full pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <SlidersHorizontal size={16} className="text-brand-primary" />
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-brand-primary">
                Your workspace
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase italic tracking-tight">
              Preferences
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Tune contact logging, dashboard modules, and CRM display. Saved to your profile.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saving && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Saving
              </span>
            )}
            {savedFlash && !saving && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-400">
                <Check size={12} /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={() => wrapSave(resetPreferences)}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-300 disabled:opacity-50"
            >
              <RotateCcw size={12} />
              Reset defaults
            </button>
          </div>
        </div>
      </div>

      <Section
        title="Contact workflow"
        description="Follow-up SLA and defaults when logging calls from the queue or CRM."
        icon={Phone}
      >
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
            Follow-up SLA (days without contact)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={14}
              value={followUpDraft}
              onChange={(e) => setFollowUpDraft(e.target.value)}
              className="w-24 bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                const days = clampFollowUpDays(Number(followUpDraft) || 3);
                setFollowUpDraft(String(days));
                wrapSave(() => updateContactWorkflow({ followUpDays: days }));
              }}
              className="px-4 py-2 rounded-xl bg-brand-primary/20 text-brand-primary text-[10px] font-black uppercase border border-brand-primary/30 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
          <p className="text-[9px] text-slate-600 mt-1">1–14 days. Used for stale follow-up detection in alerts and CRM.</p>
        </div>
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
            label="Weather widget (Operations)"
            checked={preferences.dashboardModules.showWeatherWidget}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showWeatherWidget: v }))}
            disabled={saving}
          />
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
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 pt-2">Navigation tabs</p>
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
            label="Recalls tab"
            checked={preferences.dashboardModules.showRecallsTab}
            onChange={(v) => wrapSave(() => updateDashboardModules({ showRecallsTab: v }))}
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
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Card density</p>
          <div className="flex gap-2">
            {(['standard', 'compact'] as CrmDensity[]).map((d) => (
              <button
                key={d}
                type="button"
                disabled={saving}
                onClick={() => wrapSave(() => updateCrmDisplay({ density: d }))}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all',
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
          className="text-[10px] font-black uppercase tracking-wider text-brand-primary hover:underline"
        >
          Go to Directory →
        </button>
      </Section>

      <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center">
        Preferences sync across devices · CRM search is saved locally on this browser
      </p>
    </div>
  );
}
