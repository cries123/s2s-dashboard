import type {
  DealershipSettings,
  DispatchIntakeRequiredFields,
  DispatchLaneCustomization,
  DispatchMidnightSweepConfig,
  DispatchOverdueAlertDisplay,
  DispatchOverdueRules,
  DispatchPromiseDefaults,
  DispatchStatus,
  DispatchTechDisplayConfig,
  FixedOpsForecastDefaults,
  ForecastReportPeriod,
} from '../types';
import {
  PROMISE_BUSINESS_HOURS_LABEL,
  PROMISE_TIME_MAX,
  PROMISE_TIME_MIN,
} from './dispatchPromiseTime';

export const DEFAULT_OVERDUE_GRACE_MINUTES = 0;
export const DEFAULT_OVERDUE_ALERT_DISPLAY: DispatchOverdueAlertDisplay = 'both';
export const DEFAULT_PROMISE_HOURS_FROM_NOW = 0;
export const DEFAULT_TECH_DISPLAY_REFRESH_SECONDS = 30;
export const DEFAULT_VISIBLE_DISPATCH_STATUSES: DispatchStatus[] = ['WIP', 'POO', 'WFA', 'SBL'];
export const DEFAULT_MIDNIGHT_SWEEP_MODE = 'auto' as const;
export const DEFAULT_FORECAST_REPORT_PERIOD: ForecastReportPeriod = 'next_month';

export function resolveOverdueRules(
  settings?: Partial<DealershipSettings> | null
): Required<DispatchOverdueRules> {
  const raw = settings?.dispatchOverdueRules;
  return {
    graceMinutes: Math.max(0, Math.min(120, raw?.graceMinutes ?? DEFAULT_OVERDUE_GRACE_MINUTES)),
    alertDisplay: raw?.alertDisplay ?? DEFAULT_OVERDUE_ALERT_DISPLAY,
  };
}

export function resolvePromiseDefaults(
  settings?: Partial<DealershipSettings> | null
): Required<DispatchPromiseDefaults> {
  const raw = settings?.dispatchPromiseDefaults;
  return {
    defaultHoursFromNow: Math.max(0, Math.min(12, raw?.defaultHoursFromNow ?? DEFAULT_PROMISE_HOURS_FROM_NOW)),
    businessHoursOpen: raw?.businessHoursOpen ?? PROMISE_TIME_MIN,
    businessHoursClose: raw?.businessHoursClose ?? PROMISE_TIME_MAX,
    businessHoursLabel: raw?.businessHoursLabel ?? PROMISE_BUSINESS_HOURS_LABEL,
  };
}

export function resolveTechDisplayConfig(
  settings?: Partial<DealershipSettings> | null
): Required<DispatchTechDisplayConfig> {
  const raw = settings?.dispatchTechDisplayConfig;
  const statuses = raw?.visibleStatuses?.length
    ? raw.visibleStatuses.filter(
        (s): s is DispatchStatus => s === 'WIP' || s === 'POO' || s === 'WFA' || s === 'SBL'
      )
    : DEFAULT_VISIBLE_DISPATCH_STATUSES;
  return {
    autoOpenOnTv: raw?.autoOpenOnTv === true,
    refreshIntervalSeconds: Math.max(
      10,
      Math.min(300, raw?.refreshIntervalSeconds ?? DEFAULT_TECH_DISPLAY_REFRESH_SECONDS)
    ),
    visibleStatuses: statuses.length ? statuses : DEFAULT_VISIBLE_DISPATCH_STATUSES,
  };
}

export function resolveIntakeRequired(
  settings?: Partial<DealershipSettings> | null
): Required<DispatchIntakeRequiredFields> {
  const raw = settings?.dispatchIntakeRequired;
  return {
    concern: raw?.concern === true,
    tag: raw?.tag !== false,
    techNumber: raw?.techNumber !== false,
  };
}

export function resolveLaneCustomization(
  settings?: Partial<DealershipSettings> | null
): DispatchLaneCustomization {
  return settings?.dispatchLaneCustomization ?? {};
}

export function resolveMidnightSweepConfig(
  settings?: Partial<DealershipSettings> | null
): Required<DispatchMidnightSweepConfig> {
  const mode = settings?.dispatchMidnightSweep?.mode;
  if (mode === 'confirm' || mode === 'disabled') return { mode };
  return { mode: DEFAULT_MIDNIGHT_SWEEP_MODE };
}

export function resolveForecastDefaults(
  settings?: Partial<DealershipSettings> | null
): Required<FixedOpsForecastDefaults> {
  const raw = settings?.fixedOpsForecastDefaults;
  return {
    reportPeriod: raw?.reportPeriod ?? DEFAULT_FORECAST_REPORT_PERIOD,
    includedAdvisorIds: raw?.includedAdvisorIds ?? [],
  };
}

export function shouldShowOverdueCompact(display: DispatchOverdueAlertDisplay): boolean {
  return display === 'compact' || display === 'both';
}

export function shouldShowOverdueFull(display: DispatchOverdueAlertDisplay): boolean {
  return display === 'full' || display === 'both';
}
