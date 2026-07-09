import React from 'react';
import { Shield } from 'lucide-react';
import type { LandingTab, CrmDensity } from '../../../types';
import { clampFollowUpDays } from '../../../lib/userPreferencesDefaults';

const LANDING_OPTIONS: { value: LandingTab; label: string }[] = [
  { value: 'dispatch', label: 'Dispatch' },
  { value: 'appointments', label: 'Operations' },
  { value: 'alerts', label: 'Service alerts' },
  { value: 'search', label: 'CRM directory' },
  { value: 'add', label: 'Sales onboard' },
];

interface StoreWorkspaceDefaultsSettingsProps {
  defaults: {
    followUpDays?: number;
    crmDensity?: CrmDensity;
    defaultLandingTab?: LandingTab;
  };
  onChange: (patch: Record<string, unknown>) => void;
}

export function StoreWorkspaceDefaultsSettings({
  defaults,
  onChange,
}: StoreWorkspaceDefaultsSettingsProps) {
  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      <div>
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
          <Shield size={12} className="text-brand-primary" />
          New staff workspace defaults
        </label>
        <p className="text-[10px] text-slate-500 mt-1 max-w-xl">
          Merged with the role template when a manager approves enrollment. Personal prefs can still be changed later.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
        <div>
          <label className="text-[9px] font-black uppercase text-slate-500">Follow-up SLA (days)</label>
          <input
            type="number"
            min={1}
            max={14}
            value={defaults.followUpDays ?? 3}
            onChange={(e) =>
              onChange({
                storeWorkspaceDefaults: {
                  ...defaults,
                  followUpDays: clampFollowUpDays(parseInt(e.target.value, 10) || 3),
                },
              })
            }
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white"
          />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase text-slate-500">CRM density</label>
          <select
            value={defaults.crmDensity ?? 'standard'}
            onChange={(e) =>
              onChange({
                storeWorkspaceDefaults: {
                  ...defaults,
                  crmDensity: e.target.value as CrmDensity,
                },
              })
            }
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
          >
            <option value="standard">Standard</option>
            <option value="compact">Compact</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black uppercase text-slate-500">Default landing tab</label>
          <select
            value={defaults.defaultLandingTab ?? ''}
            onChange={(e) =>
              onChange({
                storeWorkspaceDefaults: {
                  ...defaults,
                  defaultLandingTab: e.target.value ? (e.target.value as LandingTab) : undefined,
                },
              })
            }
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
          >
            <option value="">Use role template</option>
            {LANDING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default StoreWorkspaceDefaultsSettings;
