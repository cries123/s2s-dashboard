export interface OperationsViewPeriod {
  year: number;
  month: number;
  isHistorical: boolean;
  key: string;
  label: string;
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
