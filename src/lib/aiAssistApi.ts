import { authedJson } from './authedFetch';

/**
 * The AI helpers on the server (server/handlers/aiAssistRoutes.ts). They reword
 * the app's own records; the numbers are never the AI's. Nothing here is saved
 * except the store's daily briefing, which the server keeps for the day.
 */

const call = authedJson;

export interface BriefingFacts {
  todayLabel: string;
  month: string;
  laborGross?: string;
  laborGoal?: string;
  laborTrending?: string;
  laborPctOfGoal?: string;
  hoursSold?: string;
  elr?: string;
  appointmentsMtd?: string;
  appointmentsTrending?: string;
  workingDaysLeft?: string;
  lastDayLabel?: string;
  lastDayShowed?: string;
  lastDayBooked?: string;
  lastDayNoShows?: string;
  monthShowUpRate?: string;
  todayAppointments?: string;
  laborAsOf?: string;
}

export interface Briefing {
  text: string;
  /** 'ai' when written by the model; 'template' when the app wrote it itself. */
  source: 'ai' | 'template';
  facts: BriefingFacts;
  noShowNames: string[];
  date: string;
  generatedAt: string;
}

export function fetchBriefing(): Promise<Briefing> {
  return call<Briefing>('/api/ai/briefing');
}

export function summarizeHistory(customerId: string): Promise<{ text: string; visits: number }> {
  return call('/api/ai/history-summary', { method: 'POST', body: JSON.stringify({ customerId }) });
}

export function explainVisit(customerId: string, visitId: string, soNumber: string): Promise<{ text: string }> {
  return call('/api/ai/explain-visit', { method: 'POST', body: JSON.stringify({ customerId, visitId, soNumber }) });
}
