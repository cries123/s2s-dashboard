import { useMemo } from 'react';
import { useScheduleRange } from './useScheduleRange';
import { previousMonthKey, summarizeShowUp, type ShowUpSummary } from '../lib/appointmentShowUp';
import { monthKeyRange } from '../lib/operationsMonthKeys';
import { toLocalDateString } from '../lib/appointmentTracker';

export interface ShowUpRateState {
  monthKey: string;
  prevKey: string;
  current: ShowUpSummary;
  previous: ShowUpSummary;
  loading: boolean;
  error: string | null;
}

/**
 * A month's show-up rate and the month before it, from one read of the stored
 * schedule. Operations reads it once and hands it to both the Appointments tile
 * and the show-up card, so the two can never disagree.
 */
export function useShowUpRate(dealershipId: string, monthKey: string, reloadKey = 0): ShowUpRateState {
  const prevKey = previousMonthKey(monthKey);
  const start = monthKeyRange(prevKey).start;
  const end = monthKeyRange(monthKey).end;
  const { days, loading, error } = useScheduleRange(dealershipId, start, end, reloadKey);
  const today = toLocalDateString(new Date());

  const current = useMemo(
    () => summarizeShowUp(days.filter((d) => d.date.startsWith(`${monthKey}-`)), today),
    [days, monthKey, today]
  );
  const previous = useMemo(
    () => summarizeShowUp(days.filter((d) => d.date.startsWith(`${prevKey}-`)), today),
    [days, prevKey, today]
  );

  return { monthKey, prevKey, current, previous, loading, error };
}
