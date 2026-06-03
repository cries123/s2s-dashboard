import { toLocalDateString } from './appointmentTracker';

export interface DailyCountStat {
  date: string;
  count: number;
}

export interface AppointmentForecastInput {
  stats: DailyCountStat[];
  dailyTarget: number;
  laborTarget: number;
  partsTarget: number;
  mtdGross: number;
  mtdLaborSales: number;
  mtdPartsGross: number;
  referenceDate?: Date;
}

export interface AppointmentForecastMetrics {
  monthTotal: number;
  weekTotal: number;
  forecast: number;
  avgDaily: string;
  daysRemaining: number;
  lostOpportunity: number;
  mtdVariance: number;
  projectedShortfall: number;
  currentShortfall: number;
  dailyTarget: number;
  monthTarget: number;
  paceTarget: number;
  mtdGross: number;
  mtdLaborSales: number;
  mtdPartsGross: number;
  laborTarget: number;
  grossForecast: number;
  laborSalesForecast: number;
  grossPaceTarget: number;
  grossVariance: number;
  laborDailyAvg: number;
  laborSalesDailyAvg: number;
  partsForecast: number;
  partsPaceTarget: number;
  partsTarget: number;
  partsDailyAvg: number;
  partsVariance: number;
  elapsedWorkingDays: number;
  totalWorkingDays: number;
}

function countWorkingDaysInMonth(year: number, month: number, throughDayInclusive: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let totalWorkingDays = 0;
  let elapsedWorkingDays = 0;
  let remainingWorkingDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dayOfWeek = date.getDay();
    const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (isWorkingDay) {
      totalWorkingDays++;
      if (d <= throughDayInclusive) {
        elapsedWorkingDays++;
      } else {
        remainingWorkingDays++;
      }
    }
  }

  return { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays };
}

/** Month-to-date appointment forecast using Mon–Fri working-day pace. */
export function calculateAppointmentForecast(input: AppointmentForecastInput): AppointmentForecastMetrics {
  const today = input.referenceDate ?? new Date();
  const todayStr = toLocalDateString(today);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const todayDayNum = today.getDate();

  const monthStats = input.stats.filter((s) => {
    const d = new Date(`${s.date}T00:00:00`);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const monthStatsToDate = monthStats.filter((s) => s.date <= todayStr);
  const mtdActual = monthStatsToDate.reduce((acc, s) => acc + (s.count || 0), 0);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
  startOfWeek.setHours(0, 0, 0, 0);

  const weekTotal = input.stats
    .filter((s) => {
      const d = new Date(`${s.date}T00:00:00`);
      return d >= startOfWeek;
    })
    .reduce((acc, s) => acc + (s.count || 0), 0);

  const { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays } = countWorkingDaysInMonth(
    currentYear,
    currentMonth,
    todayDayNum
  );

  const activeElapsedWorkingDays = Math.max(1, elapsedWorkingDays);
  const avgDaily = mtdActual / activeElapsedWorkingDays;
  const forecast = Math.round(mtdActual + avgDaily * remainingWorkingDays);

  const dailyTarget = input.dailyTarget;
  const monthTarget = dailyTarget * totalWorkingDays;
  const paceTarget = Math.round(dailyTarget * elapsedWorkingDays);
  const mtdVariance = mtdActual - paceTarget;
  const lostOpportunity = mtdVariance < 0 ? Math.abs(mtdVariance) : 0;
  const currentShortfall = Math.max(0, monthTarget - mtdActual);
  const projectedShortfall = monthTarget - forecast;

  const laborDailyAvg = input.mtdGross / activeElapsedWorkingDays;
  const laborSalesDailyAvg = input.mtdLaborSales / activeElapsedWorkingDays;
  const grossPaceTarget = Math.round((input.laborTarget / totalWorkingDays) * elapsedWorkingDays);
  const grossForecast = Math.round(input.mtdGross + laborDailyAvg * remainingWorkingDays);
  const laborSalesForecast = Math.round(input.mtdLaborSales + laborSalesDailyAvg * remainingWorkingDays);
  const grossVariance = input.mtdGross - grossPaceTarget;

  const partsDailyAvg = input.mtdPartsGross / activeElapsedWorkingDays;
  const partsPaceTarget = Math.round((input.partsTarget / totalWorkingDays) * elapsedWorkingDays);
  const partsForecast = Math.round(input.mtdPartsGross + partsDailyAvg * remainingWorkingDays);
  const partsVariance = input.mtdPartsGross - partsPaceTarget;

  return {
    monthTotal: mtdActual,
    weekTotal,
    forecast,
    avgDaily: avgDaily.toFixed(1),
    daysRemaining: remainingWorkingDays,
    lostOpportunity,
    mtdVariance,
    projectedShortfall,
    currentShortfall,
    dailyTarget,
    monthTarget,
    paceTarget,
    mtdGross: input.mtdGross,
    mtdLaborSales: input.mtdLaborSales,
    mtdPartsGross: input.mtdPartsGross,
    laborTarget: input.laborTarget,
    grossForecast,
    laborSalesForecast,
    grossPaceTarget,
    grossVariance,
    laborDailyAvg,
    laborSalesDailyAvg,
    partsForecast,
    partsPaceTarget,
    partsTarget: input.partsTarget,
    partsDailyAvg,
    partsVariance,
    elapsedWorkingDays,
    totalWorkingDays,
  };
}

/** Forecast completion vs monthly goal (not capped at 100%). */
export function forecastGoalPercent(forecast: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((forecast / target) * 100);
}
