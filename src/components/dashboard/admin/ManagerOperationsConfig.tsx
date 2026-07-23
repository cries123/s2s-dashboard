import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  Activity,
  Bell,
  BarChart3,
  Clock,
  Gauge,
  Layers,
  Moon,
  Monitor,
  RotateCcw,
  Save,
  Target,
  Timer,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  DISPATCH_PRODUCTION_LANES,
  getOrderedDispatchLanes,
  type DispatchProductionLane,
} from '../../../lib/dispatchConfig';
import { computeDispatchActivitySummary } from '../../../lib/dispatchActivityStats';
import {
  DEFAULT_FORECAST_REPORT_PERIOD,
  DEFAULT_OVERDUE_ALERT_DISPLAY,
  DEFAULT_PROMISE_HOURS_FROM_NOW,
  DEFAULT_TECH_DISPLAY_REFRESH_SECONDS,
  DEFAULT_VISIBLE_DISPATCH_STATUSES,
} from '../../../lib/operationsConfig';
import { getDispatchDatePst } from '../../../lib/dispatchPst';
import { filterDispatchOrdersForDealership } from '../../../lib/dispatchDealershipScope';
import { getDealershipStaffConfig } from '../../../lib/dealershipStaff';
import { defaultDmsProviderForDealership } from '../../../constants/dealerDefaults';
import { normalizeDmsProvider } from '../../../constants/dmsProviders';
import { PbsAdvisorPerformanceSettings } from './PbsAdvisorPerformanceSettings';
import { resolveServiceAlertMode } from '../../../lib/dealershipSettingsUtils';
import type {
  DealershipSettings,
  DispatchMidnightSweepMode,
  DispatchOverdueAlertDisplay,
  DispatchProductionLaneId,
  DispatchRepairOrder,
  DispatchStatus,
  ForecastReportPeriod,
  ServiceAlertMode,
} from '../../../types';

interface ManagerOperationsConfigProps {
  dealershipId: string;
  dealershipName: string;
  settings: Partial<DealershipSettings>;
  onUpdate: (patch: Record<string, unknown>) => void;
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
    <div className="space-y-3 pt-4 border-t border-white/5 first:pt-0 first:border-t-0">
      <div>
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
          <Icon size={12} className="text-brand-primary" />
          {title}
        </label>
        <p className="text-[10px] text-slate-500 mt-1 max-w-xl">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description?: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center justify-between p-3 bg-slate-950/80 rounded-xl border border-white/5 cursor-pointer">
      <div className="pr-2">
        <span className="text-xs font-black text-white uppercase tracking-wide block">{label}</span>
        {description ? <span className="text-[10px] text-slate-500">{description}</span> : null}
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

const STATUS_OPTIONS: { id: DispatchStatus; label: string }[] = [
  { id: 'WIP', label: 'WIP' },
  { id: 'PRT', label: 'In parts' },
  { id: 'POO', label: 'Parts on order' },
  { id: 'WFA', label: 'Waiting advisor' },
  { id: 'SBL', label: 'Sublet' },
];

export function ManagerOperationsConfig({
  dealershipId,
  dealershipName,
  settings,
  onUpdate,
}: ManagerOperationsConfigProps) {
  const businessDatePst = getDispatchDatePst();
  const [dispatchOrders, setDispatchOrders] = useState<DispatchRepairOrder[]>([]);
  const [unmatchedAdvisorNames, setUnmatchedAdvisorNames] = useState<string[]>([]);

  const dmsProvider = normalizeDmsProvider(settings.dmsProvider) || defaultDmsProviderForDealership(dealershipId);
  const serviceAlertMode = resolveServiceAlertMode(settings);

  const [apptTarget, setApptTarget] = useState(settings.appointmentTarget ?? 20);
  const [laborTarget, setLaborTarget] = useState(settings.laborGrossTarget ?? 500_000);
  const [partsTarget, setPartsTarget] = useState(settings.partsSalesTarget ?? 300_000);

  useEffect(() => {
    setApptTarget(settings.appointmentTarget ?? 20);
    setLaborTarget(settings.laborGrossTarget ?? 500_000);
    setPartsTarget(settings.partsSalesTarget ?? 300_000);
  }, [dealershipId, settings.appointmentTarget, settings.laborGrossTarget, settings.partsSalesTarget]);

  useEffect(() => {
    const q = query(
      collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dispatchOrders'),
      where('dealershipId', '==', dealershipId)
    );
    const unsub = onSnapshot(q, (snap) => {
      setDispatchOrders(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as DispatchRepairOrder))
      );
    });
    return () => unsub();
  }, [dealershipId]);

  useEffect(() => {
    if (dmsProvider !== 'pbs') {
      setUnmatchedAdvisorNames([]);
      return;
    }
    const docId =
      dealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${dealershipId}`;
    const perfRef = doc(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'performance',
      docId
    );
    const unsub = onSnapshot(perfRef, (snap) => {
      if (!snap.exists()) {
        setUnmatchedAdvisorNames([]);
        return;
      }
      const raw = snap.data()?.unmatchedAdvisorNames;
      setUnmatchedAdvisorNames(
        Array.isArray(raw) ? raw.filter((name: unknown) => typeof name === 'string') : []
      );
    });
    return () => unsub();
  }, [dealershipId, dmsProvider]);

  const activity = useMemo(
    () =>
      computeDispatchActivitySummary(
        filterDispatchOrdersForDealership(dispatchOrders, dealershipId),
        businessDatePst
      ),
    [dispatchOrders, dealershipId, businessDatePst]
  );

  const staffConfig = getDealershipStaffConfig(dealershipId, settings);
  const advisorRoster = staffConfig.performanceAdvisorRoster.length
    ? staffConfig.performanceAdvisorRoster
    : staffConfig.competitionAdvisors;

  const overdue = settings.dispatchOverdueRules ?? {};
  const promise = settings.dispatchPromiseDefaults ?? {};
  const techDisplay = settings.dispatchTechDisplayConfig ?? {};
  const intake = settings.dispatchIntakeRequired ?? {};
  const laneCustom = settings.dispatchLaneCustomization ?? {};
  const sweep = settings.dispatchMidnightSweep?.mode ?? 'auto';
  const forecast = settings.fixedOpsForecastDefaults ?? {};
  const visibleStatuses =
    techDisplay.visibleStatuses?.length ? techDisplay.visibleStatuses : DEFAULT_VISIBLE_DISPATCH_STATUSES;

  const saveGoals = () => {
    onUpdate({
      appointmentTarget: Math.max(1, Math.round(apptTarget)),
      laborGrossTarget: Math.max(0, Math.round(laborTarget)),
      partsSalesTarget: Math.max(0, Math.round(partsTarget)),
    });
  };

  const savePriorMonthSnapshot = () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    onUpdate({
      operationsGoalsPriorMonth: {
        month,
        appointmentTarget: Math.max(1, Math.round(apptTarget)),
        laborGrossTarget: Math.max(0, Math.round(laborTarget)),
        partsSalesTarget: Math.max(0, Math.round(partsTarget)),
        savedAt: now.toISOString(),
      },
    });
  };

  const restorePriorMonth = () => {
    const snap = settings.operationsGoalsPriorMonth;
    if (!snap) return;
    setApptTarget(snap.appointmentTarget);
    setLaborTarget(snap.laborGrossTarget);
    setPartsTarget(snap.partsSalesTarget);
    onUpdate({
      appointmentTarget: snap.appointmentTarget,
      laborGrossTarget: snap.laborGrossTarget,
      partsSalesTarget: snap.partsSalesTarget,
    });
  };

  const orderedLanes = getOrderedDispatchLanes(laneCustom);

  const moveLane = (laneId: DispatchProductionLaneId, direction: -1 | 1) => {
    const current = laneCustom.order?.length
      ? [...laneCustom.order]
      : DISPATCH_PRODUCTION_LANES.map((l) => l.id);
    const idx = current.indexOf(laneId);
    if (idx < 0) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= current.length) return;
    const next = [...current];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    onUpdate({
      dispatchLaneCustomization: {
        ...laneCustom,
        order: next,
      },
    });
  };

  const toggleAdvisorInForecast = (advisorId: string) => {
    const current = forecast.includedAdvisorIds ?? [];
    const next = current.includes(advisorId)
      ? current.filter((id) => id !== advisorId)
      : [...current, advisorId];
    onUpdate({
      fixedOpsForecastDefaults: {
        ...forecast,
        includedAdvisorIds: next,
      },
    });
  };

  const toggleStatusOnDisplay = (status: DispatchStatus) => {
    const base = visibleStatuses;
    const next = base.includes(status) ? base.filter((s) => s !== status) : [...base, status];
    onUpdate({
      dispatchTechDisplayConfig: {
        ...techDisplay,
        visibleStatuses: next.length ? next : DEFAULT_VISIBLE_DISPATCH_STATUSES,
      },
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-slate-500 mb-2">
        Configure {dealershipName} operations. Defaults match current app behavior until you change and save.
      </p>

      <Section
        title="Dispatch activity summary"
        description="Live snapshot from today's board — read only."
        icon={Activity}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'ROs created today', value: String(activity.createdToday) },
            { label: 'Active on board', value: String(activity.activeCount) },
            {
              label: 'Avg min in lane',
              value: activity.avgMinutesInLane != null ? `${activity.avgMinutesInLane}m` : '—',
            },
            { label: 'Business date', value: businessDatePst },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
              <p className="text-[9px] font-black uppercase text-slate-500">{tile.label}</p>
              <p className="text-lg font-black text-white tabular-nums mt-1">{tile.value}</p>
            </div>
          ))}
        </div>
        {Object.keys(activity.laneAverages).length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {(orderedLanes as { id: DispatchProductionLane; label: string }[]).map((lane) => {
              const avg = activity.laneAverages[lane.id];
              if (avg == null) return null;
              const label = laneCustom.labels?.[lane.id] || lane.label;
              return (
                <span
                  key={lane.id}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300"
                >
                  {label}: {avg}m avg
                </span>
              );
            })}
          </div>
        ) : null}
      </Section>

      <Section
        title="Operations goals"
        description="Daily appointment goal and monthly labor/parts gross targets for reports and dispatch load."
        icon={Target}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500">Daily appointments</label>
            <input
              type="number"
              min={1}
              value={apptTarget}
              onChange={(e) => setApptTarget(parseInt(e.target.value, 10) || 20)}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500">Labor gross target</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={laborTarget}
              onChange={(e) => setLaborTarget(parseInt(e.target.value, 10) || 0)}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500">Parts sales target</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={partsTarget}
              onChange={(e) => setPartsTarget(parseInt(e.target.value, 10) || 0)}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            onClick={saveGoals}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary/20 text-brand-primary border border-brand-primary/30 text-[10px] font-black uppercase"
          >
            <Save size={12} />
            Save goals
          </button>
          <button
            type="button"
            onClick={savePriorMonthSnapshot}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white border border-slate-700 text-[10px] font-black uppercase"
          >
            Save as prior-month reference
          </button>
          <button
            type="button"
            disabled={!settings.operationsGoalsPriorMonth}
            onClick={restorePriorMonth}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-black uppercase disabled:opacity-40"
          >
            <RotateCcw size={12} />
            Reset to saved reference
          </button>
        </div>
        {settings.operationsGoalsPriorMonth ? (
          <p className="text-[10px] text-slate-600">
            Reference saved {settings.operationsGoalsPriorMonth.savedAt
              ? new Date(settings.operationsGoalsPriorMonth.savedAt).toLocaleDateString()
              : settings.operationsGoalsPriorMonth.month}
          </p>
        ) : null}
      </Section>

      <Section
        title="Service alert timing"
        description="Choose how the Service Alerts tab decides when to call customers back for maintenance."
        icon={Bell}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          {(
            [
              {
                id: 'standard' as ServiceAlertMode,
                title: 'Standard',
                description:
                  'Fixed 6-month reminders from the delivery date. Best when service history is limited or unreliable.',
              },
              {
                id: 'optimized' as ServiceAlertMode,
                title: 'Optimized',
                description:
                  'Tracks oil-change intervals from service history (e.g. every 2.2 months). Falls back to standard when history is insufficient.',
              },
            ] as const
          ).map((option) => {
            const selected = serviceAlertMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onUpdate({ serviceAlertMode: option.id })}
                className={cn(
                  'text-left p-4 rounded-xl border transition-all',
                  selected
                    ? 'border-brand-primary/40 bg-brand-primary/10'
                    : 'border-white/5 bg-slate-950/80 hover:border-slate-700'
                )}
              >
                <span className="text-xs font-black text-white uppercase tracking-wide block">
                  {option.title}
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">{option.description}</span>
                {selected ? (
                  <span className="text-[9px] font-black uppercase text-brand-primary mt-2 inline-block">
                    Active
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Section>

      {dmsProvider === 'pbs' ? (
        <PbsAdvisorPerformanceSettings
          dealershipId={dealershipId}
          settings={settings}
          unmatchedAdvisorNames={unmatchedAdvisorNames}
          onUpdate={onUpdate}
        />
      ) : null}

      <Section
        title="Fixed ops forecast defaults"
        description="Default report period and which advisors count toward forecast goals."
        icon={BarChart3}
      >
        <div className="max-w-xs">
          <label className="text-[9px] font-black uppercase text-slate-500">Report period</label>
          <select
            value={forecast.reportPeriod ?? DEFAULT_FORECAST_REPORT_PERIOD}
            onChange={(e) =>
              onUpdate({
                fixedOpsForecastDefaults: {
                  ...forecast,
                  reportPeriod: e.target.value as ForecastReportPeriod,
                },
              })
            }
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
          >
            <option value="current_month">Current month</option>
            <option value="next_month">Next month</option>
          </select>
        </div>
        {advisorRoster.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-3">
            {advisorRoster.map((a) => {
              const on = (forecast.includedAdvisorIds ?? []).includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAdvisorInForecast(a.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border',
                    on
                      ? 'border-brand-primary/40 bg-brand-primary/15 text-brand-primary'
                      : 'border-slate-700 bg-slate-900 text-slate-500'
                  )}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px] text-slate-600">Add advisors under Pot of Gold roster to filter forecast rollup.</p>
        )}
        <p className="text-[10px] text-slate-600">
          Empty selection = all advisors (current behavior).
        </p>
      </Section>

      <Section
        title="Overdue promise rules"
        description="Grace period before an RO is flagged overdue and how alerts appear on the dispatch board."
        icon={Timer}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500">Grace minutes</label>
            <input
              type="number"
              min={0}
              max={120}
              value={overdue.graceMinutes ?? 0}
              onChange={(e) =>
                onUpdate({
                  dispatchOverdueRules: {
                    ...overdue,
                    graceMinutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                  },
                })
              }
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500">Alert display</label>
            <select
              value={overdue.alertDisplay ?? DEFAULT_OVERDUE_ALERT_DISPLAY}
              onChange={(e) =>
                onUpdate({
                  dispatchOverdueRules: {
                    ...overdue,
                    alertDisplay: e.target.value as DispatchOverdueAlertDisplay,
                  },
                })
              }
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
            >
              <option value="both">Compact + full strip (default)</option>
              <option value="compact">Compact badge only</option>
              <option value="full">Full strip only</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
        </div>
      </Section>

      <Section
        title="Default promise window"
        description="Optional default hours from now on intake and business hours label shown to staff."
        icon={Clock}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500">
              Default hours from now (0 = manual)
            </label>
            <input
              type="number"
              min={0}
              max={12}
              value={promise.defaultHoursFromNow ?? DEFAULT_PROMISE_HOURS_FROM_NOW}
              onChange={(e) =>
                onUpdate({
                  dispatchPromiseDefaults: {
                    ...promise,
                    defaultHoursFromNow: Math.max(0, parseInt(e.target.value, 10) || 0),
                  },
                })
              }
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500">Business hours label</label>
            <input
              type="text"
              value={promise.businessHoursLabel ?? '7:30 AM – 5:00 PM'}
              onChange={(e) =>
                onUpdate({
                  dispatchPromiseDefaults: {
                    ...promise,
                    businessHoursLabel: e.target.value,
                  },
                })
              }
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500">Open (HH:MM)</label>
            <input
              type="text"
              placeholder="07:30"
              value={promise.businessHoursOpen ?? '07:30'}
              onChange={(e) =>
                onUpdate({
                  dispatchPromiseDefaults: {
                    ...promise,
                    businessHoursOpen: e.target.value,
                  },
                })
              }
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500">Close (HH:MM)</label>
            <input
              type="text"
              placeholder="17:00"
              value={promise.businessHoursClose ?? '17:00'}
              onChange={(e) =>
                onUpdate({
                  dispatchPromiseDefaults: {
                    ...promise,
                    businessHoursClose: e.target.value,
                  },
                })
              }
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white"
            />
          </div>
        </div>
      </Section>

      <Section
        title="Tech display defaults"
        description="Shop TV mode: auto-open, refresh interval, and which statuses appear on wall cards."
        icon={Monitor}
      >
        <Toggle
          label="Auto-open tech display on TV"
          description="Opens tech display when dispatch loads with ?tv=1 in the URL"
          enabled={techDisplay.autoOpenOnTv === true}
          onToggle={() =>
            onUpdate({
              dispatchTechDisplayConfig: {
                ...techDisplay,
                autoOpenOnTv: !techDisplay.autoOpenOnTv,
              },
            })
          }
        />
        <div className="max-w-xs mt-2">
          <label className="text-[9px] font-black uppercase text-slate-500">Refresh interval (seconds)</label>
          <input
            type="number"
            min={10}
            max={300}
            value={techDisplay.refreshIntervalSeconds ?? DEFAULT_TECH_DISPLAY_REFRESH_SECONDS}
            onChange={(e) =>
              onUpdate({
                dispatchTechDisplayConfig: {
                  ...techDisplay,
                  refreshIntervalSeconds: Math.max(10, parseInt(e.target.value, 10) || 30),
                },
              })
            }
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-black text-white"
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleStatusOnDisplay(opt.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border',
                visibleStatuses.includes(opt.id)
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-slate-700 text-slate-500'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Required intake fields"
        description="When enabled, dispatch intake blocks submit until the field is filled."
        icon={Gauge}
      >
        <div className="space-y-2 max-w-lg">
          <Toggle
            label="Concern required"
            enabled={intake.concern === true}
            onToggle={() =>
              onUpdate({
                dispatchIntakeRequired: { ...intake, concern: !intake.concern },
              })
            }
          />
          <Toggle
            label="Tag # required"
            enabled={intake.tag !== false}
            onToggle={() =>
              onUpdate({
                dispatchIntakeRequired: {
                  ...intake,
                  tag: intake.tag === false ? true : false,
                },
              })
            }
          />
          <Toggle
            label="Tech # required"
            enabled={intake.techNumber !== false}
            onToggle={() =>
              onUpdate({
                dispatchIntakeRequired: {
                  ...intake,
                  techNumber: intake.techNumber === false ? true : false,
                },
              })
            }
          />
        </div>
      </Section>

      <Section
        title="Lane labels and order"
        description="Rename production lanes and reorder columns on the dispatch board."
        icon={Layers}
      >
        <div className="space-y-2 max-w-lg">
          {orderedLanes.map((lane, idx) => (
            <div key={lane.id} className="flex gap-2 items-center">
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveLane(lane.id, -1)}
                  className="text-[9px] text-slate-500 disabled:opacity-30 px-1"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={idx === orderedLanes.length - 1}
                  onClick={() => moveLane(lane.id, 1)}
                  className="text-[9px] text-slate-500 disabled:opacity-30 px-1"
                >
                  ▼
                </button>
              </div>
              <span className="text-[9px] font-mono text-slate-600 w-24 shrink-0">{lane.id}</span>
              <input
                type="text"
                placeholder={lane.label}
                value={laneCustom.labels?.[lane.id] ?? ''}
                onChange={(e) =>
                  onUpdate({
                    dispatchLaneCustomization: {
                      ...laneCustom,
                      labels: {
                        ...laneCustom.labels,
                        [lane.id]: e.target.value,
                      },
                    },
                  })
                }
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Midnight sweep behavior"
        description="How open ROs are handled at end of shop day (PST)."
        icon={Moon}
      >
        <div className="max-w-xs">
          <select
            value={sweep}
            onChange={(e) =>
              onUpdate({
                dispatchMidnightSweep: { mode: e.target.value as DispatchMidnightSweepMode },
              })
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
          >
            <option value="auto">Auto-move to Down in Shop (default)</option>
            <option value="confirm">Prompt before sweep</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        {settings.lastDispatchOvernightSweepDate ? (
          <p className="text-[10px] text-slate-600 mt-2">
            Last sweep recorded: {settings.lastDispatchOvernightSweepDate}
          </p>
        ) : null}
      </Section>
    </div>
  );
}

export default ManagerOperationsConfig;
