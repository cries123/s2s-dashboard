import type { Firestore } from 'firebase-admin/firestore';
import {
  advisorPerformanceDoc,
  appointmentScheduleCollection,
  appointmentScheduleDocId,
  appointmentTrackerCollection,
  appointmentTrackerDocId,
  dealershipSettingsDoc,
} from '../pbs/pbsFirestore.js';
import { pacificWallClock } from '../pbs/pbsSyncSchedule.js';
import { calculateAppointmentForecast } from '../../src/lib/appointmentForecast.js';
import { resolvePerformanceTotalsFromDoc } from '../../src/lib/performanceTotals.js';
import { showUpOutcome, summarizeShowUp, type ShowUpDay } from '../../src/lib/appointmentShowUp.js';
import type { BriefingFacts } from './aiText.js';

/**
 * The numbers behind the morning briefing, worked out on the server with the
 * same code Operations uses (appointmentForecast, appointmentShowUp,
 * performanceTotals) — so the briefing can never disagree with the screen.
 * Everything comes back pre-formatted: the AI copies these strings, it does
 * no arithmetic of its own.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function dayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

export interface BriefingData {
  facts: BriefingFacts;
  /** Shown on the card next to the AI text, never sent to the AI. */
  noShowNames: string[];
  today: string;
}

export async function loadBriefingFacts(db: Firestore, dealershipId: string, now = new Date()): Promise<BriefingData> {
  const w = pacificWallClock(now);
  const today = ymd(w.year, w.month, w.day);
  const monthPrefix = today.slice(0, 8);
  const lastDayOfMonth = new Date(Date.UTC(w.year, w.month, 0)).getUTCDate();
  const monthDays = Array.from({ length: lastDayOfMonth }, (_, i) => ymd(w.year, w.month, i + 1));
  const recentDays = Array.from({ length: 8 }, (_, i) => shiftDays(today, -i)); // today and the 7 before
  const scheduleDays = [...new Set([...monthDays, ...recentDays])];

  const [settingsSnap, perfSnap, trackerSnaps, scheduleSnaps] = await Promise.all([
    dealershipSettingsDoc(db, dealershipId).get(),
    advisorPerformanceDoc(db, dealershipId).get(),
    db.getAll(...monthDays.map((d) => appointmentTrackerCollection(db).doc(appointmentTrackerDocId(dealershipId, d)))),
    db.getAll(...scheduleDays.map((d) => appointmentScheduleCollection(db).doc(appointmentScheduleDocId(dealershipId, d)))),
  ]);

  const settings = settingsSnap.data() || {};
  const perf = perfSnap.exists ? perfSnap.data() : undefined;
  // The live sheet can still hold last month's figures for the first hours of
  // a new month; only use it once it covers this one.
  const perfThisMonth = perf && String(perf.reportStartDate || perf.reportEndDate || '').startsWith(monthPrefix);
  const totals = perfThisMonth ? resolvePerformanceTotalsFromDoc(perf as Parameters<typeof resolvePerformanceTotalsFromDoc>[0]) : null;

  const stats = trackerSnaps
    .filter((s) => s.exists)
    .map((s) => ({ date: String(s.data()?.date ?? ''), count: Number(s.data()?.count) || 0 }))
    .filter((s) => s.date);

  // Noon on today's Pacific date: the server runs in UTC, and the forecast reads
  // the calendar off the Date it is given.
  const forecast = calculateAppointmentForecast({
    stats,
    dailyTarget: Number(settings.appointmentTarget) || 20,
    laborTarget: Number(settings.laborGrossTarget) || 500000,
    partsTarget: Number(settings.partsSalesTarget) || 300000,
    mtdGross: totals?.totalGross ?? 0,
    mtdLaborSales: totals?.totalLabor ?? 0,
    mtdPartsGross: totals?.totalGrossParts ?? 0,
    mtdHoursSold: totals?.totalHrs ?? 0,
    performanceReportEndDate: totals?.reportEndDate,
    referenceDate: new Date(`${today}T12:00:00`),
  });

  const schedule = new Map<string, ShowUpDay>();
  for (const s of scheduleSnaps) {
    if (!s.exists) continue;
    const d = s.data() || {};
    const date = String(d.date ?? '');
    if (date) schedule.set(date, { date, appointments: Array.isArray(d.appointments) ? d.appointments : [] });
  }

  const month = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const facts: BriefingFacts = {
    todayLabel: new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
    month,
  };

  if (totals && totals.totalGross > 0) {
    facts.laborGross = money(totals.totalGross);
    facts.laborGoal = money(forecast.laborTarget);
    facts.laborTrending = money(forecast.grossForecast);
    if (forecast.laborTarget > 0) facts.laborPctOfGoal = `${Math.round((forecast.grossForecast / forecast.laborTarget) * 100)}%`;
    if (totals.totalHrs > 0) {
      facts.hoursSold = `${Math.round(totals.totalHrs).toLocaleString('en-US')} hours`;
      facts.elr = `$${Math.round(forecast.effectiveLaborRate)} an hour`;
    }
    const synced = perf?.pbsSyncedAt ? new Date(String(perf.pbsSyncedAt)) : null;
    if (synced && !Number.isNaN(synced.getTime())) {
      facts.laborAsOf = synced.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit',
        ...(pacificWallClock(synced).day !== w.day ? { month: 'short', day: 'numeric' } : {}),
      });
    }
  }

  if (stats.some((s) => s.date.startsWith(monthPrefix))) {
    facts.appointmentsMtd = forecast.monthTotal.toLocaleString('en-US');
    facts.appointmentsTrending = Math.round(forecast.forecast).toLocaleString('en-US');
    facts.workingDaysLeft = String(forecast.daysRemaining);
  }

  // The last day before today that had anyone booked.
  const noShowNames: string[] = [];
  const lastDay = recentDays.slice(1).find((d) => (schedule.get(d)?.appointments ?? []).some((a) => showUpOutcome(a, d, today) !== 'cancelled'));
  if (lastDay) {
    const s = summarizeShowUp([schedule.get(lastDay)!], today);
    if (s.showed + s.noShow > 0) {
      facts.lastDayLabel = lastDay === shiftDays(today, -1) ? 'Yesterday' : dayName(lastDay);
      facts.lastDayShowed = String(s.showed);
      facts.lastDayBooked = String(s.showed + s.noShow);
      facts.lastDayNoShows = String(s.noShow);
      noShowNames.push(...s.noShows.map((n) => n.customerName).filter(Boolean));
    }
  }

  const monthShowUp = summarizeShowUp(monthDays.map((d) => schedule.get(d)).filter((d): d is ShowUpDay => Boolean(d)), today);
  if (monthShowUp.rate != null) facts.monthShowUpRate = `${monthShowUp.rate}%`;

  const todaysSlots = schedule.get(today)?.appointments ?? [];
  const todayBooked = todaysSlots.filter((a) => showUpOutcome(a, today, today) !== 'cancelled').length;
  if (todayBooked > 0) facts.todayAppointments = String(todayBooked);

  return { facts, noShowNames, today };
}
