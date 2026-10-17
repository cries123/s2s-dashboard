import { authedJson } from './authedFetch';

/** Shapes from server/recalls/checkVinRecalls.ts. */
export interface VinRecall {
  nhtsaCampaign: string;
  hyundaiCodes: string[];
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  reportDate: string;
  parkIt: boolean;
  parkOutside: boolean;
  done: { soNumber: string; date: string; open: boolean } | null;
  listedFor: string;
  baseModelOnly: boolean;
}

export interface VinRecallReport {
  vehicle: { vin: string; year: string; make: string; model: string; trim?: string; powertrain: 'ice' | 'hev' | 'phev' | 'ev' };
  /** 'profile' when NHTSA's VIN decoder was down and the profile's year and model were used. */
  vehicleSource: 'vin' | 'profile';
  checkedModels: string[];
  recalls: VinRecall[];
  history: { profiles: number; visits: number };
  nhtsaVinLookupUrl: string;
}

/** The recalls NHTSA lists for this car's model, each checked against the car's repair orders. */
export function fetchVinRecalls(vin: string): Promise<VinRecallReport> {
  return authedJson<VinRecallReport>(`/api/recalls/vin/${encodeURIComponent(vin)}`);
}
