/**
 * The Fixed Operations Forecast workbook, as code.
 *
 * This is a direct transcription of the spreadsheet the store forecasts with —
 * "Service Forecast Hyundai of Santa Maria". Every formula here was read off
 * that workbook and the tests reproduce its printed totals to the cent, so the
 * screen and the spreadsheet cannot drift apart.
 *
 * The shape of the thing, in the order the workbook works:
 *
 *   1. Capacity. For each weekday: how many of them fall in the month, how many
 *      technicians work that day, and how many hours each. Multiply and sum for
 *      the hours the shop could sell.
 *   2. Knock off absenteeism, then multiply by forecast efficiency, giving net
 *      projected hours — the one number everything else is a share of.
 *   3. Labor. Split those hours across pay types by mix %, price each at its
 *      effective labor rate, and take gross at its GP %.
 *   4. Parts. Each pay type's parts sale is its labor sale times a
 *      parts-to-labor ratio. Tires are entered directly instead.
 *   5. Counter retail, wholesale, accessories and gas/oil/grease are entered
 *      directly, sale and GP %.
 *
 * Only the inputs are entered; everything else is computed. In the workbook the
 * entered cells are the orange ones, which is exactly the set this file takes.
 */

/** Monday through Sunday, the order the workbook's columns run in. */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface WeekdayCapacity {
  /** How many of this weekday fall in the month. */
  daysInMonth: number;
  /** Technicians on the floor that day. */
  techsAvailable: number;
  /** Hours each of them works. */
  hoursEach: number;
}

/** A labor pay type: a share of the hours, a rate, and a gross margin. */
export interface LaborLineInput {
  key: string;
  label: string;
  /** Share of net projected hours, as a percentage (59 for 59%). */
  mixPercent: number;
  /** Effective labor rate, dollars per hour. */
  elr: number;
  /** Gross profit, as a percentage (80 for 80%). */
  gpPercent: number;
}

/**
 * A parts line priced off its labor line. The workbook's ratios run above 1 for
 * warranty and service contract work, where the parts on a job outsell the labor.
 */
export interface PartsLineInput {
  key: string;
  label: string;
  /** Which labor line's sales this is a ratio of. */
  laborKey: string;
  /** Parts sales as a multiple of that line's labor sales (0.85 for 85%). */
  partsToLaborRatio: number;
  gpPercent: number;
}

/** A line entered as a dollar figure rather than derived: tires, counter, wholesale. */
export interface DirectLineInput {
  key: string;
  label: string;
  sales: number;
  gpPercent: number;
}

export interface FixedOpsForecastInputs {
  /** Working days in the month, and of those, days the shop is open for service. */
  workingDays: number;
  serviceDays: number;
  capacity: Record<Weekday, WeekdayCapacity>;
  /** Hours lost to absence, as a percentage of hours available. */
  absenteeismPercent: number;
  /** Forecast efficiency, as a percentage. */
  efficiencyPercent: number;
  labor: LaborLineInput[];
  sublet: { sales: number; gpPercent: number };
  /** Unapplied time comes off the service gross at the end. */
  unappliedTime: number;
  parts: PartsLineInput[];
  /** Tires and anything else priced directly on the parts side. */
  partsDirect: DirectLineInput[];
  /** Counter retail, wholesale, accessories, gas/oil/grease. */
  counter: DirectLineInput[];
}

export interface ComputedLine {
  key: string;
  label: string;
  hours: number;
  elr: number;
  sales: number;
  gpPercent: number;
  gross: number;
}

export interface FixedOpsForecastResult {
  /** Step 1–2: capacity down to the number everything else divides up. */
  hoursAvailableByWeekday: Record<Weekday, number>;
  totalMonthlyHoursAvailable: number;
  lostHours: number;
  totalProjectedHours: number;
  totalNetProjectedHours: number;

  /** Step 3: labor. */
  laborLines: ComputedLine[];
  totalLaborHours: number;
  totalLaborSales: number;
  totalLaborGross: number;
  /** Blended rate across every pay type. */
  totalElr: number;
  laborGpPercent: number;

  sublet: { sales: number; gross: number };
  totalServiceSales: number;
  totalServiceGross: number;
  serviceGpPercent: number;
  /** Service gross after unapplied time. */
  adjustedServiceGross: number;

  /** Step 4–5: parts. */
  partsLines: ComputedLine[];
  partsShopSales: number;
  partsShopGross: number;
  partsShopGpPercent: number;
  counterLines: ComputedLine[];
  totalPartsSales: number;
  totalPartsGross: number;
  partsGpPercent: number;

  fixedOpsSales: number;
  fixedOpsGross: number;
  fixedOpsGpPercent: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const ratio = (part: number, whole: number): number => (whole === 0 ? 0 : (part / whole) * 100);

export function computeFixedOpsForecast(inputs: FixedOpsForecastInputs): FixedOpsForecastResult {
  // 1. Capacity, weekday by weekday.
  const hoursAvailableByWeekday = {} as Record<Weekday, number>;
  let totalMonthlyHoursAvailable = 0;
  for (const day of WEEKDAYS) {
    const cell = inputs.capacity[day];
    const hours = num(cell?.daysInMonth) * num(cell?.techsAvailable) * num(cell?.hoursEach);
    hoursAvailableByWeekday[day] = hours;
    totalMonthlyHoursAvailable += hours;
  }

  // 2. Absenteeism, then efficiency.
  const lostHours = totalMonthlyHoursAvailable * (num(inputs.absenteeismPercent) / 100);
  const totalProjectedHours = totalMonthlyHoursAvailable - lostHours;
  const totalNetProjectedHours = totalProjectedHours * (num(inputs.efficiencyPercent) / 100);

  // 3. Labor: hours split by mix, priced at each line's rate.
  const laborLines: ComputedLine[] = (inputs.labor ?? []).map((line) => {
    const hours = totalNetProjectedHours * (num(line.mixPercent) / 100);
    const sales = hours * num(line.elr);
    return {
      key: line.key,
      label: line.label,
      hours,
      elr: num(line.elr),
      sales,
      gpPercent: num(line.gpPercent),
      gross: sales * (num(line.gpPercent) / 100),
    };
  });

  const totalLaborHours = laborLines.reduce((sum, l) => sum + l.hours, 0);
  const totalLaborSales = laborLines.reduce((sum, l) => sum + l.sales, 0);
  const totalLaborGross = laborLines.reduce((sum, l) => sum + l.gross, 0);

  const sublet = {
    sales: num(inputs.sublet?.sales),
    gross: num(inputs.sublet?.sales) * (num(inputs.sublet?.gpPercent) / 100),
  };

  const totalServiceSales = totalLaborSales + sublet.sales;
  const totalServiceGross = totalLaborGross + sublet.gross;

  // 4. Parts priced off the labor line each one belongs to.
  const salesByLaborKey = new Map(laborLines.map((l) => [l.key, l.sales]));
  const partsFromLabor: ComputedLine[] = (inputs.parts ?? []).map((line) => {
    const sales = num(salesByLaborKey.get(line.laborKey)) * num(line.partsToLaborRatio);
    return {
      key: line.key,
      label: line.label,
      hours: 0,
      elr: num(line.partsToLaborRatio),
      sales,
      gpPercent: num(line.gpPercent),
      gross: sales * (num(line.gpPercent) / 100),
    };
  });

  const toComputed = (line: DirectLineInput): ComputedLine => ({
    key: line.key,
    label: line.label,
    hours: 0,
    elr: 0,
    sales: num(line.sales),
    gpPercent: num(line.gpPercent),
    gross: num(line.sales) * (num(line.gpPercent) / 100),
  });

  const partsLines = [...partsFromLabor, ...(inputs.partsDirect ?? []).map(toComputed)];
  const partsShopSales = partsLines.reduce((sum, l) => sum + l.sales, 0);
  const partsShopGross = partsLines.reduce((sum, l) => sum + l.gross, 0);

  const counterLines = (inputs.counter ?? []).map(toComputed);
  const totalPartsSales = partsShopSales + counterLines.reduce((sum, l) => sum + l.sales, 0);
  const totalPartsGross = partsShopGross + counterLines.reduce((sum, l) => sum + l.gross, 0);

  return {
    hoursAvailableByWeekday,
    totalMonthlyHoursAvailable,
    lostHours,
    totalProjectedHours,
    totalNetProjectedHours,

    laborLines,
    totalLaborHours,
    totalLaborSales,
    totalLaborGross,
    totalElr: totalNetProjectedHours === 0 ? 0 : totalLaborSales / totalNetProjectedHours,
    laborGpPercent: ratio(totalLaborGross, totalLaborSales),

    sublet,
    totalServiceSales,
    totalServiceGross,
    serviceGpPercent: ratio(totalServiceGross, totalServiceSales),
    adjustedServiceGross: totalServiceGross - num(inputs.unappliedTime),

    partsLines,
    partsShopSales,
    partsShopGross,
    partsShopGpPercent: ratio(partsShopGross, partsShopSales),
    counterLines,
    totalPartsSales,
    totalPartsGross,
    partsGpPercent: ratio(totalPartsGross, totalPartsSales),

    fixedOpsSales: totalServiceSales + totalPartsSales,
    fixedOpsGross: totalServiceGross + totalPartsGross,
    fixedOpsGpPercent: ratio(totalServiceGross + totalPartsGross, totalServiceSales + totalPartsSales),
  };
}

/**
 * The workbook's own line-ups. Pay types and parts categories are fixed columns
 * in the spreadsheet, so they are fixed here too; only their numbers are typed.
 */
export const WORKBOOK_LABOR_LINES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'custPay', label: 'Customer pay' },
  { key: 'warrPay', label: 'Warranty' },
  { key: 'internal', label: 'Internal' },
  { key: 'srvContract', label: 'Service contract' },
  { key: 'intAcc', label: 'Internal accessories' },
  { key: 'quickLube', label: 'Quick lube' },
];

export const WORKBOOK_PARTS_LINES: ReadonlyArray<{ key: string; label: string; laborKey: string }> = [
  { key: 'cpParts', label: 'Customer pay parts', laborKey: 'custPay' },
  { key: 'warrParts', label: 'Warranty parts', laborKey: 'warrPay' },
  { key: 'internalParts', label: 'Internal parts', laborKey: 'internal' },
  { key: 'srvContractParts', label: 'Service contract parts', laborKey: 'srvContract' },
  { key: 'intAccParts', label: 'Internal accessory parts', laborKey: 'intAcc' },
  { key: 'quickLubeParts', label: 'Quick lube parts', laborKey: 'quickLube' },
];

export const WORKBOOK_PARTS_DIRECT_LINES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'tires', label: 'Tires' },
];

export const WORKBOOK_COUNTER_LINES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'counterRetail', label: 'Counter retail' },
  { key: 'wholesale', label: 'Wholesale' },
  { key: 'accCustomer', label: 'Accessory customer' },
  { key: 'accWarranty', label: 'Accessory warranty' },
  { key: 'accInternal', label: 'Accessory internal' },
  { key: 'accCounterRetail', label: 'Accessory counter retail' },
  { key: 'accWholesale', label: 'Accessory wholesale' },
  { key: 'gasOilGrease', label: 'Gas, oil and grease' },
];

const emptyCapacity = (): Record<Weekday, WeekdayCapacity> => {
  const out = {} as Record<Weekday, WeekdayCapacity>;
  for (const day of WEEKDAYS) out[day] = { daysInMonth: 0, techsAvailable: 0, hoursEach: 0 };
  return out;
};

/** A blank workbook with the right rows, for a store starting from nothing. */
export function emptyFixedOpsForecastInputs(): FixedOpsForecastInputs {
  return {
    workingDays: 0,
    serviceDays: 0,
    capacity: emptyCapacity(),
    absenteeismPercent: 0,
    efficiencyPercent: 100,
    labor: WORKBOOK_LABOR_LINES.map((l) => ({ ...l, mixPercent: 0, elr: 0, gpPercent: 0 })),
    sublet: { sales: 0, gpPercent: 0 },
    unappliedTime: 0,
    parts: WORKBOOK_PARTS_LINES.map((l) => ({ ...l, partsToLaborRatio: 0, gpPercent: 0 })),
    partsDirect: WORKBOOK_PARTS_DIRECT_LINES.map((l) => ({ ...l, sales: 0, gpPercent: 0 })),
    counter: WORKBOOK_COUNTER_LINES.map((l) => ({ ...l, sales: 0, gpPercent: 0 })),
  };
}

/**
 * The mix percentages have to add to 100 or the hours do not all get sold. The
 * workbook has no such check, which is how a mix that quietly sums to 97% turns
 * into a forecast 3% light with nothing on screen to say why.
 */
export function mixPercentTotal(labor: ReadonlyArray<{ mixPercent: number }>): number {
  return labor.reduce((sum, l) => sum + num(l.mixPercent), 0);
}

/**
 * Carry a forecast forward: the capacity and rates stay, and next month's
 * weekday counts are the only thing that has genuinely changed.
 */
export function withWeekdayCounts(
  inputs: FixedOpsForecastInputs,
  counts: Record<Weekday, number>
): FixedOpsForecastInputs {
  const capacity = {} as Record<Weekday, WeekdayCapacity>;
  for (const day of WEEKDAYS) {
    capacity[day] = { ...inputs.capacity[day], daysInMonth: num(counts[day]) };
  }
  const workingDays = WEEKDAYS.reduce(
    (sum, day) => sum + (capacity[day].techsAvailable > 0 ? num(counts[day]) : 0),
    0
  );
  return { ...inputs, capacity, workingDays, serviceDays: workingDays };
}

/** How many of each weekday fall in a month, for 'YYYY-MM'. */
export function weekdayCountsForMonth(monthKey: string): Record<Weekday, number> {
  const counts = {} as Record<Weekday, number>;
  for (const day of WEEKDAYS) counts[day] = 0;
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return counts;
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    // getDay() is 0 for Sunday; WEEKDAYS starts at Monday.
    const jsDay = new Date(year, month - 1, d).getDay();
    counts[WEEKDAYS[(jsDay + 6) % 7]] += 1;
  }
  return counts;
}
