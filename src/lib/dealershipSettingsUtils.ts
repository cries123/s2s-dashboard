import { DEALERSHIPS } from '../constants';
import type { DealershipSettings, DispatchProductionLaneId } from '../types';
import { POT_OF_GOLD_OP_CODES } from './potOfGoldData';

export const DEFAULT_SERVICE_ALERT_INTERVAL_DAYS = 180;

export const DEFAULT_WEATHER = {
  lat: 34.953,
  lon: -120.4357,
  city: 'Santa Maria, CA',
};

export function mergeDealershipSettings(
  dealershipId: string,
  raw?: Partial<DealershipSettings> | null
): DealershipSettings {
  const staticRow = DEALERSHIPS.find((d) => d.id === dealershipId);
  return {
    id: dealershipId,
    appointmentTarget: raw?.appointmentTarget ?? 20,
    laborGrossTarget: raw?.laborGrossTarget ?? 500_000,
    partsSalesTarget: raw?.partsSalesTarget ?? 300_000,
    enableDispatchTab: raw?.enableDispatchTab !== false,
    enablePotOfGoldTab: raw?.enablePotOfGoldTab !== false,
    enableForecastTab: raw?.enableForecastTab !== false,
    enableSalesPerformanceTab: raw?.enableSalesPerformanceTab !== false,
    enableVinSearchTab: raw?.enableVinSearchTab !== false,
    serviceAlertIntervalDays: raw?.serviceAlertIntervalDays ?? DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
    enrollmentJoinCode: raw?.enrollmentJoinCode ?? staticRow?.code ?? '',
    weatherLat: raw?.weatherLat ?? DEFAULT_WEATHER.lat,
    weatherLon: raw?.weatherLon ?? DEFAULT_WEATHER.lon,
    weatherDisplayCity: raw?.weatherDisplayCity ?? DEFAULT_WEATHER.city,
    competitionAdvisors: raw?.competitionAdvisors,
    competitionTechnicians: raw?.competitionTechnicians,
    performanceAdvisorRoster: raw?.performanceAdvisorRoster,
    potOfGoldUpsellPrices: raw?.potOfGoldUpsellPrices,
    dmsProvider: raw?.dmsProvider,
    dispatchLaneCapacity: raw?.dispatchLaneCapacity,
    dispatchShowTodayLoad: raw?.dispatchShowTodayLoad !== false,
    dispatchBlockWhenFull: raw?.dispatchBlockWhenFull === true,
    hiddenDispatchLanes: raw?.hiddenDispatchLanes ?? [],
    updatedAt: raw?.updatedAt as DealershipSettings['updatedAt'],
  };
}

export function resolveEnrollmentJoinCode(
  dealershipId: string,
  settings?: Partial<DealershipSettings> | null
): string {
  const merged = mergeDealershipSettings(dealershipId, settings);
  return (merged.enrollmentJoinCode || '').trim().toUpperCase();
}

export function isNavFeatureEnabled(
  settings: Partial<DealershipSettings> | null | undefined,
  key:
    | 'enableDispatchTab'
    | 'enablePotOfGoldTab'
    | 'enableForecastTab'
    | 'enableSalesPerformanceTab'
    | 'enableVinSearchTab'
): boolean {
  const merged = mergeDealershipSettings(settings?.id || 'hyundai', settings);
  return merged[key] !== false;
}

export function isDispatchLaneVisible(
  settings: Partial<DealershipSettings> | null | undefined,
  laneId: DispatchProductionLaneId
): boolean {
  const hidden = settings?.hiddenDispatchLanes ?? [];
  return !hidden.includes(laneId);
}

export function defaultPotOfGoldUpsellPrices() {
  return POT_OF_GOLD_OP_CODES.map(({ code, desc }) => ({
    code,
    desc,
    defaultPrice: 0,
  }));
}

export function clampServiceAlertIntervalDays(days: number): number {
  return Math.min(730, Math.max(30, Math.round(days)));
}
