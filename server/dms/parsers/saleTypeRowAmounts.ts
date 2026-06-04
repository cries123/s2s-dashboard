/**
 * PBS CSR "Sale Type" rows are typically: Sales | Cost | SO# | Gross | GP%
 * Some PDF extractions omit SO# or GP% (3–4 numeric columns). Never treat SO#,
 * GP%, or Lab-Sold Avg/SO as Gross.
 */
export function looksLikeGpPercent(n: number): boolean {
  return n >= 0 && n <= 100;
}

export function looksLikeAvgPerRo(
  value: number,
  sales: number,
  soCount: number
): boolean {
  if (soCount < 2 || sales <= 0 || value <= 0) return false;
  const avg = sales / soCount;
  return Math.abs(value - avg) < Math.max(0.5, avg * 0.02);
}

export function parseSaleTypeRowAmounts(clean: number[]): { sales: number; gross: number } {
  const sales = clean[0] || 0;
  if (sales <= 0) return { sales: 0, gross: 0 };

  const cost = clean.length > 1 ? clean[1] : 0;
  const grossFromCost =
    cost > 0 && cost < sales ? Math.round((sales - cost) * 100) / 100 : 0;
  const grossWhenZeroCost =
    cost === 0 ? Math.round(sales * 100) / 100 : grossFromCost;

  const looksLikeSoCount = (n: number) =>
    n > 0 &&
    n < 10000 &&
    Math.abs(n - Math.round(n)) < 0.001 &&
    n < sales * 0.5;

  const looksLikeGrossDollars = (n: number) =>
    n > 0 && n < sales * 0.999 && (n > 100 || sales < 150);

  // Sales | Cost | SO# | Gross | GP%
  if (clean.length >= 5) {
    if (looksLikeGrossDollars(clean[3])) return { sales, gross: clean[3] };
    if (grossFromCost > 0) return { sales, gross: grossFromCost };
    return { sales, gross: grossWhenZeroCost || clean[3] || grossFromCost };
  }

  // Sales | Cost | SO# | Gross  OR  Sales | Cost | SO# | GP%
  if (clean.length === 4) {
    if (looksLikeSoCount(clean[2]) && looksLikeGrossDollars(clean[3])) {
      return { sales, gross: clean[3] };
    }
    if (looksLikeSoCount(clean[2]) && looksLikeGpPercent(clean[3])) {
      return { sales, gross: grossWhenZeroCost || grossFromCost };
    }
    if (looksLikeGrossDollars(clean[2]) && looksLikeGpPercent(clean[3])) {
      return { sales, gross: clean[2] };
    }
    if (grossFromCost > 0) return { sales, gross: grossFromCost };
    return {
      sales,
      gross: looksLikeGrossDollars(clean[2]) ? clean[2] : grossWhenZeroCost,
    };
  }

  // Sales | Cost | Gross
  if (clean.length === 3) {
    if (looksLikeGrossDollars(clean[2])) return { sales, gross: clean[2] };
    if (grossFromCost > 0) return { sales, gross: grossFromCost };
    return { sales, gross: grossWhenZeroCost || clean[2] };
  }

  return { sales, gross: grossFromCost || grossWhenZeroCost };
}

export function repairMisidentifiedGross(
  gross: number,
  sales: number,
  clean: number[],
  soCount = 0
): number {
  if (sales <= 0) return gross;

  const { gross: reparsed } = parseSaleTypeRowAmounts(clean);
  if (reparsed > 0 && !looksLikeAvgPerRo(reparsed, sales, soCount)) {
    if (gross <= 0 || looksLikeAvgPerRo(gross, sales, soCount)) return reparsed;
    if (looksLikeGpPercent(gross) && gross < sales * 0.5) return reparsed;
  }

  if (looksLikeAvgPerRo(gross, sales, soCount)) {
    if (reparsed > gross) return reparsed;
    const cost = clean.length > 1 ? clean[1] : 0;
    if (cost >= 0 && cost < sales) {
      return Math.round((sales - cost) * 100) / 100;
    }
  }

  return repairGrossWhenMirrorsSales(gross, sales, clean);
}

export function repairGrossWhenMirrorsSales(
  gross: number,
  sales: number,
  clean: number[]
): number {
  if (sales <= 0) return gross;
  const mirrorsSales =
    gross <= 0 || Math.abs(gross - sales) < 0.02 || gross / sales > 0.995;
  if (!mirrorsSales) return gross;

  const { gross: reparsed } = parseSaleTypeRowAmounts(clean);
  if (reparsed > 0 && reparsed < sales * 0.995) return reparsed;

  const cost = clean.length > 1 ? clean[1] : 0;
  if (cost > 0 && cost < sales) {
    return Math.round((sales - cost) * 100) / 100;
  }
  return gross;
}
