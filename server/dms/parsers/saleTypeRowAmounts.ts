/**
 * PBS CSR "Sale Type" rows are typically: Sales | Cost | SO# | Gross | GP%
 * Some PDF extractions omit SO# (3–4 numeric columns). Never treat SO# as Gross.
 */
export function parseSaleTypeRowAmounts(clean: number[]): { sales: number; gross: number } {
  const sales = clean[0] || 0;
  if (sales <= 0) return { sales: 0, gross: 0 };

  const cost = clean.length > 1 ? clean[1] : 0;
  const grossFromCost =
    cost > 0 && cost < sales ? Math.round((sales - cost) * 100) / 100 : 0;

  const looksLikeSoCount = (n: number) =>
    n > 0 &&
    n < 10000 &&
    Math.abs(n - Math.round(n)) < 0.001 &&
    n < sales * 0.5;

  const looksLikeGross = (n: number) => n > 0 && n < sales * 0.999;

  if (clean.length >= 5) {
    if (looksLikeGross(clean[3])) return { sales, gross: clean[3] };
    if (grossFromCost > 0) return { sales, gross: grossFromCost };
    return { sales, gross: clean[3] || grossFromCost };
  }

  if (clean.length === 4) {
    if (looksLikeSoCount(clean[2]) && looksLikeGross(clean[3])) {
      return { sales, gross: clean[3] };
    }
    if (looksLikeGross(clean[2]) && clean[3] <= 100) {
      return { sales, gross: clean[2] };
    }
    if (grossFromCost > 0) return { sales, gross: grossFromCost };
    return { sales, gross: looksLikeGross(clean[2]) ? clean[2] : grossFromCost };
  }

  if (clean.length === 3) {
    if (looksLikeGross(clean[2])) return { sales, gross: clean[2] };
    if (grossFromCost > 0) return { sales, gross: grossFromCost };
    return { sales, gross: clean[2] };
  }

  return { sales, gross: grossFromCost };
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
