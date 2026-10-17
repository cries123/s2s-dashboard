import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { customersCollection } from '../pbs/pbsFirestore.js';
import {
  vehicleFromProfile,
  baseMayNotCoverCar,
  candidateNames,
  findRecallWork,
  hyundaiCodesFrom,
  nhtsaVinLookupUrl,
  powertrainOf,
  type DecodedVin,
  type RecallWorkFound,
  type RecallWorkVisit,
} from './vinRecalls.js';

export interface VinRecall {
  nhtsaCampaign: string;
  hyundaiCodes: string[];
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  /** YYYY-MM-DD */
  reportDate: string;
  parkIt: boolean;
  parkOutside: boolean;
  /** The newest repair order of this car's with the campaign on it. */
  done: RecallWorkFound | null;
  /** The NHTSA model name it is filed under. */
  listedFor: string;
  /**
   * Filed under the base model only: NHTSA lists no recalls under this car's
   * own hybrid / electric name, so whether it covers this car isn't stated.
   */
  baseModelOnly: boolean;
}

export interface VinRecallReport {
  vehicle: DecodedVin;
  /** 'profile' when NHTSA's VIN decoder was down and the profile's year and model were used. */
  vehicleSource: 'vin' | 'profile';
  /** The NHTSA model names asked about, e.g. ["KONA ELECTRIC"]. */
  checkedModels: string[];
  recalls: VinRecall[];
  /** How much of this car's history was searched. */
  history: { profiles: number; visits: number };
  nhtsaVinLookupUrl: string;
}

export class RecallLookupError extends Error {}

const NHTSA = 'https://api.nhtsa.gov';

async function getJson(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, body };
}

/** "28/04/2021" -> "2021-04-28". */
function nhtsaDate(s: unknown): string {
  const m = String(s ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s ?? '');
}

/** The decoder itself didn't answer — as opposed to answering that the VIN is bad. */
class DecoderUnavailable extends RecallLookupError {}

async function decodeVin(vin: string): Promise<DecodedVin> {
  let status = 0;
  let body: any = null;
  try {
    ({ status, body } = await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`));
  } catch {
    /* unreachable: treated as down */
  }
  const r = body?.Results?.[0];
  if (status !== 200 || !r) throw new DecoderUnavailable("NHTSA's VIN decoder didn't answer. Try again in a minute.");
  if (!r.Make || !r.Model || !r.ModelYear) throw new RecallLookupError("This VIN couldn't be decoded to a year, make and model. Check it for typos.");
  return {
    vin,
    year: String(r.ModelYear),
    make: String(r.Make),
    model: String(r.Model),
    trim: r.Trim ? String(r.Trim) : undefined,
    powertrain: powertrainOf(r.ElectrificationLevel, r.FuelTypePrimary, r.FuelTypeSecondary),
  };
}

async function recallsForModel(make: string, model: string, year: string): Promise<any[]> {
  const url = `${NHTSA}/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
  const { status, body } = await getJson(url);
  // NHTSA answers "nothing found" with a 400 and Count 0 — that is an empty
  // list, not an error. Anything else that isn't a 200 is a failed check.
  if (status === 200 || (status === 400 && body?.Count === 0)) return Array.isArray(body?.results) ? body.results : [];
  throw new RecallLookupError(`NHTSA's recall list didn't answer for ${year} ${model} (${status}). Try again in a minute.`);
}

/** Every profile for this car and the visits in them. */
async function visitsForVin(db: Firestore, vin: string, dealershipId: string, isAdmin: boolean) {
  const profiles = new Map<string, DocumentData & { _ref: FirebaseFirestore.DocumentReference }>();
  const [byVin, byTail] = await Promise.all([
    customersCollection(db).where('vin', '==', vin).limit(20).get(),
    customersCollection(db).where('vinLast8', '==', vin.slice(-8)).limit(20).get(),
  ]);
  for (const snap of [...byVin.docs, ...byTail.docs]) {
    const d = snap.data();
    // A tail match counts only for a profile with no full VIN of its own.
    const fullVin = String(d.vin || '').toUpperCase();
    if (fullVin.length === 17 && fullVin !== vin) continue;
    if (!isAdmin && String(d.dealershipId || 'hyundai') !== dealershipId) continue;
    profiles.set(snap.id, { ...d, _ref: snap.ref });
  }

  const visits: RecallWorkVisit[] = [];
  for (const p of profiles.values()) {
    const sub = await p._ref.collection('serviceVisits').get();
    const seen = new Set<string>();
    for (const doc of sub.docs) {
      const v = doc.data() as RecallWorkVisit;
      seen.add(String(v.soNumber ?? doc.id));
      visits.push(v);
    }
    for (const v of Array.isArray(p.recentVisits) ? (p.recentVisits as RecallWorkVisit[]) : []) {
      if (!seen.has(String(v?.soNumber ?? ''))) visits.push(v);
    }
  }
  // A profile tied to the full VIN describes the car best.
  const described = [...profiles.values()].sort((a, b) => Number(String(b.vin || '').length === 17) - Number(String(a.vin || '').length === 17));
  const first = described.find((p) => p.model);
  const profileVehicle = first ? { year: first.year, make: first.make, model: first.model } : null;
  return { profiles: profiles.size, visits, profileVehicle };
}

export async function checkVinRecalls(
  db: Firestore | null,
  rawVin: string,
  caller: { dealershipId: string; isAdmin: boolean }
): Promise<VinRecallReport> {
  const vin = String(rawVin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (vin.length !== 17) throw new RecallLookupError('A VIN is 17 characters.');

  // The car's own history first: it is needed either way, and when NHTSA's
  // VIN decoder is down its profile says what the car is.
  const history = db ? await visitsForVin(db, vin, caller.dealershipId, caller.isAdmin) : { profiles: 0, visits: [] as RecallWorkVisit[], profileVehicle: null };

  let vehicle: DecodedVin;
  let vehicleSource: 'vin' | 'profile' = 'vin';
  try {
    vehicle = await decodeVin(vin);
  } catch (err) {
    const fromProfile = err instanceof DecoderUnavailable && history.profileVehicle ? vehicleFromProfile(vin, history.profileVehicle) : null;
    if (!fromProfile) throw err;
    vehicle = fromProfile;
    vehicleSource = 'profile';
  }
  const { variants, base, extras } = candidateNames(vehicle);
  if (!base) throw new RecallLookupError("This VIN's model couldn't be read.");

  const byCampaign = new Map<string, { r: any; listedFor: string; baseModelOnly: boolean }>();
  const add = (results: any[], listedFor: string, baseModelOnly: boolean) => {
    for (const r of results) {
      if (r?.NHTSACampaignNumber && !byCampaign.has(r.NHTSACampaignNumber)) {
        byCampaign.set(r.NHTSACampaignNumber, { r, listedFor, baseModelOnly });
      }
    }
  };
  const checkedModels: string[] = [];

  // The hybrid / plug-in / electric version's own recalls, under every name
  // NHTSA has used for it.
  const variantResults = await Promise.all(variants.map((v) => recallsForModel(vehicle.make, v, vehicle.year)));
  variants.forEach((v, i) => {
    if (variantResults[i].length) {
      add(variantResults[i], v, false);
      checkedModels.push(v);
    }
  });

  // A gas car — or a version with nothing filed under its own name (2022
  // TUCSON HYBRID): the base model's recalls, marked when NHTSA also sells
  // that model in another powertrain, rather than risk a missed recall.
  if (byCampaign.size === 0) {
    let mayNotCover = false;
    if (vehicle.powertrain !== 'ice') {
      const models = await getJson(
        `${NHTSA}/products/vehicle/models?modelYear=${encodeURIComponent(vehicle.year)}&make=${encodeURIComponent(vehicle.make)}&issueType=r`
      );
      // If the list can't be read, say "may not cover" rather than claim it does.
      mayNotCover = models.status === 200 ? baseMayNotCoverCar(vehicle, (models.body?.results ?? []).map((r: any) => r.model)) : true;
    }
    add(await recallsForModel(vehicle.make, base, vehicle.year), base, mayNotCover);
    checkedModels.push(base);
  }
  for (const extra of extras) {
    const found = await recallsForModel(vehicle.make, extra, vehicle.year);
    if (found.length) {
      add(found, extra, false);
      checkedModels.push(extra);
    }
  }

  const recalls: VinRecall[] = [...byCampaign.values()].map(({ r, listedFor, baseModelOnly }) => {
    const hyundaiCodes = hyundaiCodesFrom(r.Remedy, r.Notes, r.Summary);
    return {
      listedFor,
      baseModelOnly,
      nhtsaCampaign: String(r.NHTSACampaignNumber),
      hyundaiCodes,
      component: String(r.Component ?? ''),
      summary: String(r.Summary ?? ''),
      consequence: String(r.Consequence ?? ''),
      remedy: String(r.Remedy ?? ''),
      reportDate: nhtsaDate(r.ReportReceivedDate),
      parkIt: Boolean(r.parkIt),
      parkOutside: Boolean(r.parkOutSide),
      done: findRecallWork(history.visits, hyundaiCodes),
    };
  });
  // Not on our repair orders first, then newest.
  recalls.sort((a, b) => Number(Boolean(a.done)) - Number(Boolean(b.done)) || b.reportDate.localeCompare(a.reportDate));

  return {
    vehicle,
    vehicleSource,
    checkedModels,
    recalls,
    history: { profiles: history.profiles, visits: history.visits.length },
    nhtsaVinLookupUrl: nhtsaVinLookupUrl(vin),
  };
}
