import type { CompetitionAdvisorSlot } from './dealershipStaff';

export interface OpCodeRow {
  code: string;
  desc: string;
}

export const POT_OF_GOLD_OP_CODES: OpCodeRow[] = [
  { code: 'AF', desc: 'ENGINE AIR FILTER' },
  { code: 'ALIGN', desc: 'PERFORM 2/4 WHEEL ALIGNMENT' },
  { code: 'BAT', desc: 'BATTERY REPLACEMENT' },
  { code: 'BFR', desc: 'BRAKE FLUID SERVICE' },
  { code: 'CAF', desc: 'CABIN AIR FILTER' },
  { code: 'CE', desc: 'COOLING SYSTEM EXCHANGE' },
  { code: 'FB', desc: 'FRONT BRAKE PAD/RESURFACE' },
  { code: 'FSC', desc: 'MOC ENHANCE FUEL SYSTEM' },
  { code: 'GDI', desc: 'GDI FUEL/AIR INDUCTION' },
  { code: 'RB', desc: 'REAR BRAKE PAD/SERVICE' },
  { code: 'TIRE1', desc: 'MOUNT AND BALANCE 1 TIRE' },
  { code: 'TIRE2', desc: 'MOUNT AND BALANCE 2 TIRES' },
  { code: 'TIRE3', desc: 'MOUNT AND BALANCE 3 TIRES' },
  { code: 'TIRE4', desc: 'MOUNT AND BALANCE 4 TIRES' },
  { code: 'TS', desc: 'TRANSMISSION SERVICE' },
  { code: 'CCC', desc: 'COMBUSTION CHAMBER CLEANING' },
];

export type AdvisorPerformanceRow = OpCodeRow & Record<string, number | string>;

export type TechPerformanceRow = OpCodeRow & Record<string, number | string>;

export function buildEmptyAdvisorRows(
  advisors: CompetitionAdvisorSlot[]
): AdvisorPerformanceRow[] {
  return POT_OF_GOLD_OP_CODES.map(({ code, desc }) => {
    const row: AdvisorPerformanceRow = { code, desc };
    advisors.forEach((a) => {
      row[a.id] = 0;
    });
    return row;
  });
}

export function buildEmptyTechRows(technicians: string[]): TechPerformanceRow[] {
  return POT_OF_GOLD_OP_CODES.map(({ code, desc }) => {
    const row: TechPerformanceRow = { code, desc };
    technicians.forEach((t) => {
      row[t] = 0;
    });
    return row;
  });
}

export function mergeAdvisorRowsFromFirestore(
  stored: AdvisorPerformanceRow[] | undefined,
  advisors: CompetitionAdvisorSlot[]
): AdvisorPerformanceRow[] {
  const template = buildEmptyAdvisorRows(advisors);
  if (!stored?.length) return template;

  return template.map((templateRow) => {
    const existing = stored.find((r) => r.code === templateRow.code);
    if (!existing) return templateRow;

    const merged: AdvisorPerformanceRow = { code: templateRow.code, desc: templateRow.desc };
    advisors.forEach((a) => {
      const val = existing[a.id];
      merged[a.id] = typeof val === 'number' ? val : Number(val) || 0;
    });
    return merged;
  });
}

export function zeroAdvisorCounts(
  rows: AdvisorPerformanceRow[],
  advisorIds: string[]
): AdvisorPerformanceRow[] {
  return rows.map((row) => {
    const next = { ...row };
    advisorIds.forEach((id) => {
      next[id] = 0;
    });
    return next;
  });
}

export function advisorCount(row: AdvisorPerformanceRow, advisorIds: string[]): number {
  return advisorIds.reduce((sum, id) => sum + (Number(row[id]) || 0), 0);
}
