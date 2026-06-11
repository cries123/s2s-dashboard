import React from 'react';
import { Trophy, Cloud, KeyRound, Monitor, Wrench } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { DISPATCH_PRODUCTION_LANES } from '../../../lib/dispatchConfig';
import { DEFAULT_WEATHER } from '../../../lib/dealershipSettingsUtils';
import {
  getDealershipStaffConfig,
  type CompetitionAdvisorSlot,
  type CompetitionTechnicianSlot,
  type PerformanceAdvisorSlot,
} from '../../../lib/dealershipStaff';

interface DealershipAdvancedSettingsProps {
  dealershipId: string;
  dealershipName: string;
  settings: Record<string, unknown>;
  localCompetitionAdvisors: Record<string, CompetitionAdvisorSlot[]>;
  localTechnicians: Record<string, CompetitionTechnicianSlot[]>;
  localPerformanceRoster: Record<string, PerformanceAdvisorSlot[]>;
  onUpdateSetting: (id: string, patch: Record<string, unknown>) => void;
  onUpdateCompetitionAdvisor: (
    id: string,
    index: number,
    field: 'id' | 'label',
    value: string
  ) => void;
  onAddCompetitionAdvisor: (id: string) => void;
  onRemoveCompetitionAdvisor: (id: string, index: number) => void;
  onCommitCompetitionAdvisors: (id: string) => void;
  onUpdateTechnician: (
    id: string,
    index: number,
    field: 'id' | 'label',
    value: string
  ) => void;
  onAddTechnician: (id: string) => void;
  onRemoveTechnician: (id: string, index: number) => void;
  onCommitTechnicians: (id: string) => void;
  onUpdatePerformanceRoster: (
    id: string,
    index: number,
    field: 'id' | 'label',
    value: string
  ) => void;
  onAddPerformanceRoster: (id: string) => void;
  onRemovePerformanceRoster: (id: string, index: number) => void;
  onCommitPerformanceRoster: (id: string) => void;
}

function FeatureToggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center justify-between p-3 bg-slate-950/80 rounded-xl border border-white/5 cursor-pointer">
      <div className="pr-2">
        <span className="text-xs font-black text-white uppercase tracking-wide block">{label}</span>
        <span className="text-[10px] text-slate-500">{description}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-11 h-6 rounded-full transition-colors relative shrink-0',
          enabled ? 'bg-brand-primary' : 'bg-slate-800'
        )}
      >
        <span
          className={cn(
            'absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-all shadow-md',
            enabled ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </label>
  );
}

export function DealershipAdvancedSettings({
  dealershipId,
  dealershipName,
  settings,
  localCompetitionAdvisors,
  localTechnicians,
  localPerformanceRoster,
  onUpdateSetting,
  onUpdateCompetitionAdvisor,
  onAddCompetitionAdvisor,
  onRemoveCompetitionAdvisor,
  onCommitCompetitionAdvisors,
  onUpdateTechnician,
  onAddTechnician,
  onRemoveTechnician,
  onCommitTechnicians,
  onUpdatePerformanceRoster,
  onAddPerformanceRoster,
  onRemovePerformanceRoster,
  onCommitPerformanceRoster,
}: DealershipAdvancedSettingsProps) {
  const s = (settings[dealershipId] || {}) as Record<string, any>;
  const techs =
    localTechnicians[dealershipId] ||
    getDealershipStaffConfig(dealershipId, s as { competitionTechnicians?: CompetitionTechnicianSlot[] })
      .competitionTechnicians;
  const perfRoster =
    localPerformanceRoster[dealershipId] ||
    getDealershipStaffConfig(dealershipId, s as { performanceAdvisorRoster?: PerformanceAdvisorSlot[] })
      .performanceAdvisorRoster;

  const navToggle = (key: string, current: boolean) =>
    onUpdateSetting(dealershipId, { [key]: !current });

  return (
    <div className="space-y-6 pt-4 border-t border-white/5">
      <div className="space-y-3">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
          <KeyRound size={12} /> Enrollment join code — {dealershipName}
        </label>
        <input
          type="text"
          value={(s.enrollmentJoinCode as string) || ''}
          placeholder="e.g. HY934"
          onChange={(e) =>
            onUpdateSetting(dealershipId, { enrollmentJoinCode: e.target.value.trim().toUpperCase() })
          }
          className="max-w-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white uppercase"
        />
      </div>

      <div className="space-y-3">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
          <Cloud size={12} /> Weather widget location
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-xl">
          <input
            type="text"
            placeholder="City label"
            value={(s.weatherDisplayCity as string) ?? DEFAULT_WEATHER.city}
            onChange={(e) => onUpdateSetting(dealershipId, { weatherDisplayCity: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Lat"
            value={(s.weatherLat as number) ?? DEFAULT_WEATHER.lat}
            onChange={(e) => onUpdateSetting(dealershipId, { weatherLat: parseFloat(e.target.value) })}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Lon"
            value={(s.weatherLon as number) ?? DEFAULT_WEATHER.lon}
            onChange={(e) => onUpdateSetting(dealershipId, { weatherLon: parseFloat(e.target.value) })}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
          <Monitor size={12} /> Navigation feature toggles (dealership)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <FeatureToggle
            label="Bundle menus (TV)"
            description="Service bundle menu board in sidebar (default: Hyundai only)"
            enabled={s.enableBundleMenus ?? dealershipId === 'hyundai'}
            onToggle={() =>
              navToggle('enableBundleMenus', s.enableBundleMenus ?? dealershipId === 'hyundai')
            }
          />
          <FeatureToggle
            label="Pot of Gold"
            description="Competition tab in header"
            enabled={s.enablePotOfGoldTab !== false}
            onToggle={() => navToggle('enablePotOfGoldTab', s.enablePotOfGoldTab !== false)}
          />
          <FeatureToggle
            label="Forecast"
            description="Fixed ops forecast report"
            enabled={s.enableForecastTab !== false}
            onToggle={() => navToggle('enableForecastTab', s.enableForecastTab !== false)}
          />
          <FeatureToggle
            label="Sales performance"
            description="Sales performance report tab"
            enabled={s.enableSalesPerformanceTab !== false}
            onToggle={() => navToggle('enableSalesPerformanceTab', s.enableSalesPerformanceTab !== false)}
          />
          <FeatureToggle
            label="VIN search"
            description="VIN lookup tab"
            enabled={s.enableVinSearchTab !== false}
            onToggle={() => navToggle('enableVinSearchTab', s.enableVinSearchTab !== false)}
          />
        </div>
      </div>

      <RosterEditor
        title="Pot of Gold technicians"
        icon={Wrench}
        rows={techs}
        onUpdate={(idx, field, val) => onUpdateTechnician(dealershipId, idx, field, val)}
        onAdd={() => onAddTechnician(dealershipId)}
        onRemove={(idx) => onRemoveTechnician(dealershipId, idx)}
        onSave={() => onCommitTechnicians(dealershipId)}
      />

      <RosterEditor
        title="Performance / archive advisor roster"
        icon={Trophy}
        rows={perfRoster}
        onUpdate={(idx, field, val) => onUpdatePerformanceRoster(dealershipId, idx, field, val)}
        onAdd={() => onAddPerformanceRoster(dealershipId)}
        onRemove={(idx) => onRemovePerformanceRoster(dealershipId, idx)}
        onSave={() => onCommitPerformanceRoster(dealershipId)}
      />

      <div className="space-y-2 pt-3 border-t border-white/5">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">
          Hidden dispatch lanes
        </label>
        <div className="flex flex-wrap gap-2">
          {DISPATCH_PRODUCTION_LANES.map((lane) => {
            const hidden = ((s.hiddenDispatchLanes as string[]) || []).includes(lane.id);
            return (
              <button
                key={lane.id}
                type="button"
                onClick={() => {
                  const prev = ((s.hiddenDispatchLanes as string[]) || []) as string[];
                  const next = hidden ? prev.filter((id) => id !== lane.id) : [...prev, lane.id];
                  onUpdateSetting(dealershipId, { hiddenDispatchLanes: next });
                }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border',
                  hidden
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                )}
              >
                {lane.label} {hidden ? 'hidden' : 'visible'}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RosterEditor({
  title,
  icon: Icon,
  rows,
  onUpdate,
  onAdd,
  onRemove,
  onSave,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  rows: { id: string; label: string }[];
  onUpdate: (index: number, field: 'id' | 'label', value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 pt-3 border-t border-white/5">
      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
        <Icon size={12} className="text-brand-primary" />
        {title}
      </label>
      <div className="space-y-2 max-w-lg">
        {rows.map((row, idx) => (
          <div key={`${row.id}-${idx}`} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={row.label}
              onChange={(e) => onUpdate(idx, 'label', e.target.value)}
              placeholder="Display name"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
            />
            <input
              type="text"
              value={row.id}
              onChange={(e) => onUpdate(idx, 'id', e.target.value)}
              placeholder="Key"
              className="w-full sm:w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300"
            />
            <button type="button" onClick={() => onRemove(idx)} className="text-[10px] font-black uppercase text-rose-400">
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onAdd} className="px-4 py-2 bg-slate-800 text-[10px] font-black uppercase rounded-xl text-white">
          Add row
        </button>
        <button type="button" onClick={onSave} className="px-4 py-2 bg-brand-primary/20 text-brand-primary text-[10px] font-black uppercase rounded-xl border border-brand-primary/30">
          Save roster
        </button>
      </div>
    </div>
  );
}

export default DealershipAdvancedSettings;
