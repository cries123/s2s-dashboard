import { toLocalDateString } from './appointmentTracker';

export interface DailyCountStat {
  date: string;
  count: number;
}

/**
 * Merge unsaved daily volume entry into tracker stats so forecast/grid reflect
 * what the user is typing before they click save.
 */
export function buildEffectiveAppointmentStats(
  stats: DailyCountStat[],
  selectedDate: string,
  dailyCountInput: string
): DailyCountStat[] {
  const trimmed = dailyCountInput.trim();
  if (trimmed === '') return stats;

  const parsed = parseInt(trimmed, 10);
  if (Number.isNaN(parsed)) return stats;

  const savedCount = stats.find((s) => s.date === selectedDate)?.count;
  if (savedCount === parsed) return stats;

  const without = stats.filter((s) => s.date !== selectedDate);
  return [...without, { date: selectedDate, count: parsed }];
}

export interface AppointmentForecastInput {
  stats: DailyCountStat[];
  dailyTarget: number;
  laborTarget: number;
  partsTarget: number;
  mtdGross: number;
  mtdLaborSales: number;
  mtdPartsGross: number;
  /** Last day covered by the imported productivity report (ISO date). Pace uses working days through this date. */
  performanceReportEndDate?: string;
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

function isWorkingDay(year: number, month: number, day: number): boolean {
  const dayOfWeek = new Date(year, month, day).getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

/**
 * Working days elapsed for sales pace — excludes in-progress today when nothing
 * logged yet.
 *
 * `paceDay` is the last day the gross/parts numerator actually covers (it gets
 * capped to a stale performance report's end date by the caller when that
 * report is older than today). `realTodayDayNum` is the actual current date.
 * The "exclude today, nothing logged yet" adjustment must only fire when the
 * pace window truly extends through today — if the report is stale, `paceDay`
 * is already a fully closed, fully-reported day with nothing "in progress" to
 * exclude, and testing it against today's (irrelevant) logged count would
 * wrongly shrink the denominator and inflate the pace.
 */
function salesPaceWorkingDays(
  year: number,
  month: number,
  paceDay: number,
  todayCount: number,
  realTodayDayNum: number
): number {
  const { elapsedWorkingDays } = countWorkingDaysInMonth(year, month, paceDay);
  if (
    paceDay === realTodayDayNum &&
    todayCount === 0 &&
    isWorkingDay(year, month, paceDay) &&
    elapsedWorkingDays > 1
  ) {
    return elapsedWorkingDays - 1;
  }
  return Math.max(1, elapsedWorkingDays);
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
  const todayCount = monthStatsToDate.find((s) => s.date === todayStr)?.count ?? 0;

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

  // Appointment pace = average on days with logged volume (matches weekly grid intuition).
  const daysWithLoggedVolume = monthStatsToDate.filter((s) => (s.count || 0) > 0).length;
  const apptPaceDays = Math.max(1, daysWithLoggedVolume);
  const avgDaily = mtdActual / apptPaceDays;
  const forecast = Math.round(mtdActual + avgDaily * remainingWorkingDays);

  const dailyTarget = input.dailyTarget;
  const monthTarget = dailyTarget * totalWorkingDays;
  const paceTarget = Math.round(dailyTarget * elapsedWorkingDays);
  const mtdVariance = mtdActual - paceTarget;
  const lostOpportunity = mtdVariance < 0 ? Math.abs(mtdVariance) : 0;
  const currentShortfall = Math.max(0, monthTarget - mtdActual);
  const projectedShortfall = monthTarget - forecast;

  let grossPaceDay = todayDayNum;
  if (input.performanceReportEndDate) {
    const reportEnd = new Date(`${input.performanceReportEndDate}T12:00:00`);
    if (
      !Number.isNaN(reportEnd.getTime()) &&
      reportEnd.getFullYear() === currentYear &&
      reportEnd.getMonth() === currentMonth
    ) {
      grossPaceDay = Math.min(todayDayNum, reportEnd.getDate());
    }
  }

  const salesPaceDays = salesPaceWorkingDays(currentYear, currentMonth, grossPaceDay, todayCount, todayDayNum);
  const laborDailyAvg = input.mtdGross / salesPaceDays;
  const laborSalesDailyAvg = input.mtdLaborSales / salesPaceDays;
  const grossPaceTarget = Math.round((input.laborTarget / totalWorkingDays) * elapsedWorkingDays);
  const grossForecast = Math.round(input.mtdGross + laborDailyAvg * remainingWorkingDays);
  const laborSalesForecast = Math.round(input.mtdLaborSales + laborSalesDailyAvg * remainingWorkingDays);
  const grossVariance = input.mtdGross - grossPaceTarget;

  const partsDailyAvg = input.mtdPartsGross / salesPaceDays;
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
