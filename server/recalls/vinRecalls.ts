/**
 * Recalls for one VIN, checked against the car's own repair orders.
 *
 * What it replaced said "NO RECALLS — Fully Compliant" for every car, because
 * it asked NHTSA for an address that does not exist (recalls/recallsByVin
 * answers 403 to everyone), and beside that listed every recall for the base
 * model — so a Kona Electric was shown the gas Kona's engine recall and none of
 * its own three battery recalls.
 *
 * Now:
 *   1. The VIN is decoded (vPIC) for year, make, model, and whether it is a
 *      hybrid, plug-in or electric.
 *   2. NHTSA's own model names for that year are fetched, and the right one is
 *      picked: KONA ELECTRIC / KONA EV, TUCSON HYBRID / HEV, TUCSON PLUG-IN
 *      HYBRID / PHEV... the naming changes year to year (pickRecallModels).
 *   3. Every recall NHTSA lists for that model is read, with Hyundai's own
 *      number for it, which NHTSA prints in the remedy text ("Hyundai's number
 *      for this recall is 214").
 *   4. The car's repair orders are searched for that number — the store writes
 *      recall work under it as the job's request code ("RECALL 272 ...").
 *
 * What it can't do: NHTSA publishes recalls by model, not by VIN. Some recalls
 * cover only part of a model year (or cars with an option, like a tow hitch),
 * so a recall listed here may not include this exact car. The screen says so
 * and links to NHTSA's own lookup for the VIN; it never claims "no recalls".
 *
 * The pure functions have no imports so the tests can bundle them on their own.
 */

export type Powertrain = 'ice' | 'hev' | 'phev' | 'ev';

export interface DecodedVin {
  vin: string;
  year: string;
  make: string;
  model: string;
  trim?: string;
  powertrain: Powertrain;
}

/** Hybrid / plug-in / electric, from vPIC's electrification and fuel fields. */
export function powertrainOf(electrification: string | undefined, fuelPrimary: string | undefined, fuelSecondary?: string): Powertrain {
  const e = String(electrification ?? '').toUpperCase();
  if (e.includes('PHEV') || e.includes('PLUG')) return 'phev';
  if (e.includes('BEV') || e.includes('BATTERY ELECTRIC')) return 'ev';
  if (e.includes('HEV') || e.includes('HYBRID')) return 'hev';
  const f1 = String(fuelPrimary ?? '').toUpperCase();
  const f2 = String(fuelSecondary ?? '').toUpperCase();
  if (f1 === 'ELECTRIC' && !f2) return 'ev';
  if (f1.includes('ELECTRIC') || f2.includes('ELECTRIC')) return 'hev';
  return 'ice';
}

const norm = (s: unknown) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

const VARIANT_SUFFIXES: Record<Exclude<Powertrain, 'ice'>, string[]> = {
  ev: ['ELECTRIC', 'EV'],
  hev: ['HYBRID', 'HEV'],
  phev: ['PLUG-IN HYBRID', 'PLUG-IN', 'PHEV'],
};

const VARIANT_SUFFIXES_ALL: Record<Exclude<Powertrain, 'ice'>, string[]> = {
  ev: [...VARIANT_SUFFIXES.ev, 'BEV'],
  hev: [...VARIANT_SUFFIXES.hev, 'HYBRID HEV'],
  phev: [...VARIANT_SUFFIXES.phev, 'PLUG-IN HYBRID PHEV'],
};

/**
 * The NHTSA model names to ask for, for this car.
 *
 * NHTSA's own model list can't be trusted for spelling — 2026 lists
 * "SANTA FE HYBRID HEV" and "IONIQ 5 BEV" while the recalls are filed under
 * "SANTA FE HYBRID" and "IONIQ 5" — so the candidates are asked for directly:
 *
 *   variants  every way NHTSA has spelled this car's hybrid / plug-in /
 *             electric version (KONA ELECTRIC, KONA EV, TUCSON HYBRID,
 *             TUCSON PHEV...). If any has recalls, those are the car's.
 *   base      the plain model name: the car itself when it is gas, and the
 *             fallback when none of the variants has anything filed.
 *   extras    N / N-LINE, for a gas car with that trim.
 */
export function candidateNames(car: Pick<DecodedVin, 'model' | 'trim' | 'powertrain'>): {
  variants: string[];
  base: string;
  extras: string[];
} {
  const base = norm(car.model);
  if (!base) return { variants: [], base: '', extras: [] };
  if (car.powertrain !== 'ice') {
    return { variants: VARIANT_SUFFIXES_ALL[car.powertrain].map((s) => `${base} ${s}`), base, extras: [] };
  }
  const trim = norm(car.trim);
  const extras = /\bN[ -]?LINE\b/.test(trim)
    ? [`${base} N-LINE`, `${base} N LINE`]
    : trim === 'N' || /\bN$/.test(trim)
      ? [`${base} N`]
      : [];
  return { variants: [], base, extras };
}

function powertrainOfName(name: string, base: string): Powertrain | 'plain' {
  const suffix = name.slice(base.length).trim();
  if (!suffix) return 'plain';
  if (/PLUG|PHEV/.test(suffix)) return 'phev';
  if (/HYBRID|HEV/.test(suffix)) return 'hev';
  if (/ELECTRIC|\bEV\b|BEV/.test(suffix)) return 'ev';
  return 'ice';
}

/**
 * Whether the base model's recalls might not cover this hybrid / electric car:
 * true when NHTSA also sells the model in another powertrain — a gas Tucson
 * beside the Tucson Hybrid. An Ioniq 5 only comes electric, so its recalls
 * under "IONIQ 5" are simply its own.
 */
export function baseMayNotCoverCar(car: Pick<DecodedVin, 'model' | 'powertrain'>, nhtsaModels: readonly string[]): boolean {
  if (car.powertrain === 'ice') return false;
  const base = norm(car.model);
  const kinds = new Set(
    nhtsaModels
      .map(norm)
      .filter((n) => n === base || n.startsWith(`${base} `))
      .map((n) => powertrainOfName(n, base))
  );
  if (kinds.has('ice')) return true;
  if ([...kinds].some((k) => k !== 'plain' && k !== 'ice' && k !== car.powertrain)) return true;
  // A plain name alongside a name for this car's own version: the plain one is the gas car.
  return kinds.has('plain') && kinds.has(car.powertrain);
}
/**
 * Hyundai's campaign number(s) from NHTSA's text, however it is written:
 * "... is 214", "... are 211 and 009G", "... are 253(H), 017G(G)",
 * "... is 257/021G", "... are 272 (Hyundai) and 025G (Genesis)".
 */
export function hyundaiCodesFrom(...texts: Array<string | undefined>): string[] {
  const codes: string[] = [];
  for (const t of texts) {
    for (const m of String(t ?? '').matchAll(/Hyundai'?s?\s+numbers?\s+for\s+this\s+(?:recall|campaign)\s+(?:is|are)\s+([^.]+)/gi)) {
      const list = m[1].replace(/\([^)]*\)/g, ' ');
      for (const tok of list.split(/\s*(?:,|\/|\band\b|&)\s*/i)) {
        const code = tok.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (/^[A-Z0-9]{2,6}$/.test(code)) codes.push(code);
      }
    }
  }
  return [...new Set(codes)];
}

export interface RecallWorkLine {
  requestCode?: string;
  concern?: string;
  correction?: string;
  labourLines?: Array<{ opCode?: string; description?: string }>;
}

export interface RecallWorkVisit {
  soNumber?: string;
  date?: string;
  open?: boolean;
  lines?: RecallWorkLine[];
}

export interface RecallWorkFound {
  soNumber: string;
  date: string;
  open: boolean;
}

/** Does this job line carry this Hyundai campaign number? */
export function lineHasCampaign(line: RecallWorkLine, code: string): boolean {
  const c = code.toUpperCase();
  if (norm(line.requestCode) === c) return true;
  for (const l of line.labourLines || []) {
    const op = norm(l.opCode);
    if (op === c) return true;
    // "304A" for campaign 304: the number, then one letter.
    if (c.length >= 3 && op.length === c.length + 1 && op.startsWith(c) && /[A-Z]$/.test(op)) return true;
  }
  const text = [line.concern, line.correction, ...(line.labourLines || []).map((l) => l.description)].map(norm).join(' ');
  const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "RECALL 272DTC..." runs words together, so only a following digit rules it out.
  return new RegExp(`\\b(?:RECALL|CAMPAIGN)\\s*#?\\s*${escaped}(?![0-9])`).test(text);
}

/** The newest repair order with this campaign on it, if any. */
export function findRecallWork(visits: readonly RecallWorkVisit[], codes: readonly string[]): RecallWorkFound | null {
  if (codes.length === 0) return null;
  const hits = visits
    .filter((v) => (v.lines || []).some((l) => codes.some((c) => lineHasCampaign(l, c))))
    .map((v) => ({ soNumber: String(v.soNumber ?? ''), date: String(v.date ?? '').slice(0, 10), open: Boolean(v.open) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  // A finished repair order beats an open one: the work is done.
  return hits.find((h) => !h.open) ?? hits[0] ?? null;
}

const HYUNDAI_MODELS = [
  'SANTA FE XL', 'SANTA FE', 'SANTA CRUZ', 'IONIQ 5', 'IONIQ 6', 'IONIQ 9', 'IONIQ', 'ELANTRA GT', 'ELANTRA',
  'SONATA', 'TUCSON', 'KONA', 'PALISADE', 'VENUE', 'ACCENT', 'VELOSTER', 'NEXO', 'AZERA', 'GENESIS',
];

/**
 * The car as its profile describes it — for when NHTSA's VIN decoder is down
 * (it answered 503 to everyone on 2026-10-16). Profiles carry the model the
 * way PBS writes it: "TUCSON HYBRID", "2023 HYUNDAI TUCSON HYBRID BLUE",
 * "Kona Electric", "Ioniq 5".
 */
export function vehicleFromProfile(
  vin: string,
  profile: { year?: unknown; make?: unknown; model?: unknown }
): DecodedVin | null {
  let model = norm(profile.model).replace(/^(19|20)\d{2}\s+/, '').replace(/^HYUNDAI\s+/, '');
  const year = String(profile.year ?? '').match(/\b(19|20)\d{2}\b/)?.[0] ?? norm(profile.model).match(/^(19|20)\d{2}\b/)?.[0];
  if (!model || !year) return null;
  const make = norm(profile.make) || 'HYUNDAI';

  const powertrain: Powertrain = /PLUG-?IN|\bPHEV\b/.test(model)
    ? 'phev'
    : /\bHYBRID\b|\bHEV\b/.test(model)
      ? 'hev'
      : /\bELECTRIC\b|\bEV\b|\bBEV\b/.test(model) || /^IONIQ [5-9]\b/.test(model)
        ? 'ev'
        : 'ice';
  model = model.replace(/\b(PLUG-?IN|HYBRID|PHEV|HEV|ELECTRIC|BEV|EV)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const base = HYUNDAI_MODELS.find((m) => model === m || model.startsWith(`${m} `)) ?? model.split(' ')[0];
  const trim = model.slice(base.length).trim() || undefined;
  return { vin, year, make, model: base, trim, powertrain };
}

/** NHTSA's VIN lookup, for the one question this can't answer: is this exact car included? */
export function nhtsaVinLookupUrl(vin: string): string {
  return `https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(vin)}`;
}
