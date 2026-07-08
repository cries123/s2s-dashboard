export interface OperationsViewPeriod {
  year: number;
  month: number;
  isHistorical: boolean;
  key: string;
  label: string;
}

export interface OperationsViewPeriodOption {
  value: string;
  label: string;
}

export function toYearMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function getCurrentYearMonthKey(referenceDate = new Date()): string {
  return toYearMonthKey(referenceDate.getFullYear(), referenceDate.getMonth());
}

export function getActiveMonthDateRange(referenceDate = new Date()): { start: string; end: string } {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const monthStr = String(month + 1).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    start: `${year}-${monthStr}-01`,
    end: `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function buildOperationsViewPeriodOptions(
  referenceDate = new Date(),
  archiveCount = 3
): OperationsViewPeriodOption[] {
  const activeLabel = referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const options: OperationsViewPeriodOption[] = [
    { value: 'active', label: `${activeLabel} (Active)` },
  ];

  const cursor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  for (let i = 0; i < archiveCount; i++) {
    cursor.setMonth(cursor.getMonth() - 1);
    const key = toYearMonthKey(cursor.getFullYear(), cursor.getMonth());
    const label = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    options.push({ value: key, label: `${label} (Saved)` });
  }

  return options;
}

export function buildArchiveDestinationOptions(
  referenceDate = new Date(),
  monthCount = 4
): OperationsViewPeriodOption[] {
  const options: OperationsViewPeriodOption[] = [];
  const cursor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  cursor.setMonth(cursor.getMonth() - (monthCount - 1));

  const currentKey = toYearMonthKey(referenceDate.getFullYear(), referenceDate.getMonth());
  const prevMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const previousKey = toYearMonthKey(prevMonth.getFullYear(), prevMonth.getMonth());

  for (let i = 0; i < monthCount; i++) {
    const key = toYearMonthKey(cursor.getFullYear(), cursor.getMonth());
    const label = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    let suffix = '';
    if (key === currentKey) suffix = ' (Current Active Month)';
    else if (key === previousKey) suffix = ' (Last Month Closeout)';
    options.push({ value: key, label: `${label}${suffix}` });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return options;
}

import { formatArchiveMonthLabel } from './operationsPayTypes';

export { formatArchiveMonthLabel };

export function formatArchiveDisplayLabel(selectedMonth: string): string {
  if (selectedMonth === 'active') return 'ACTIVE';
  return formatArchiveMonthLabel(selectedMonth).toUpperCase();
}

export function resolveOperationsViewPeriod(selectedMonth: string): OperationsViewPeriod {
  if (selectedMonth === 'active') {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth(),
      isHistorical: false,
      key: 'active',
      label: today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }

  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const date = new Date(year, month, 1);

  return {
    year,
    month,
    isHistorical: true,
    key: selectedMonth,
    label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

export const EMPTY_PERFORMANCE_TOTALS = {
  totalSales: 0,
  totalLabor: 0,
  totalGross: 0,
  totalParts: 0,
  totalGrossParts: 0,
  totalHrs: 0,
};

export function performanceDocId(
  baseName: string,
  dealershipId: string,
  selectedMonth: string
): string {
  const baseId = dealershipId === 'hyundai' ? baseName : `${baseName}_${dealershipId}`;
  return selectedMonth === 'active' ? baseId : `${baseId}_archive_${selectedMonth}`;
}
