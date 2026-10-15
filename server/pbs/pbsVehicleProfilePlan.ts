/**
 * One profile per VIN — where every repair order goes.
 *
 * Jaryn's rule (2026-10-15): every VIN has its own profile with an owner. The
 * same person with two cars has two profiles; their histories stay separate. A
 * repair order goes into the profile for its car, and if there is no profile
 * for that car one is created. Nothing is skipped for want of a matching profile.
 *
 * The car is identified by its VIN. Profiles from the spreadsheet import carry
 * only the last 8 characters, so a profile is the same car when:
 *   - both have a full VIN and they are equal, or
 *   - the profile has only the last 8, they match, and the makes don't disagree.
 * A full VIN that differs, or a make that disagrees, is a different car — and a
 * different car gets its own profile.
 *
 * When more than one profile turns out to be the same car (the import and the
 * PBS sync each made one), the repair order goes to one of them and the rest are
 * flagged as duplicates of it, to be merged. Nothing is deleted here.
 *
 * Decisions are taken in a fixed order and each updates what later ones see: a
 * profile that just gained its full VIN is no longer a match for a different car
 * with the same last 8, and a profile just created for a VIN takes that VIN's
 * other PBS vehicle records rather than a second profile being made.
 *
 * Pure — no Firestore, no PBS — so every rule above is tested directly.
 */

export const normalizeVehicleRef = (ref: unknown): string =>
  String(ref ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export const cleanVin = (vin: unknown): string => String(vin ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const cleanMake = (make: unknown): string => String(make ?? '').toUpperCase().replace(/[^A-Z]/g, '');

function makesAgree(a: unknown, b: unknown): boolean {
  const x = cleanMake(a);
  const y = cleanMake(b);
  return !x || !y || x.startsWith(y) || y.startsWith(x);
}

/** A vehicle as a repair order names it. */
export interface RepairOrderVehicle {
  vehicleRef: string;
  /** The customer on the repair order — who becomes the owner of a new profile. */
  contactRef?: string;
}

/** What PBS knows about that vehicle. */
export interface VehicleFacts {
  vin?: string;
  make?: string;
}

/** An existing profile, as the planner sees it. */
export interface ProfileCandidate {
  id: string;
  /** Last 8 of the VIN as stored. */
  vinLast8: string;
  /** Full VIN, when the profile has one. */
  vin?: string;
  make?: string;
  /** PBS vehicle records already tied to this profile (any form; normalised here). */
  vehicleRefs: string[];
  /** Visits on file — breaks ties when several profiles are the same car. */
  visitCount: number;
  /** ISO time; older wins a tie. */
  createdAt?: string;
}

export type CreateReason = 'no-profile' | 'different-car' | 'no-vin';

export interface CreateProfile {
  /** Stand-in id until the profile is written; attaches may point at it. */
  tempId: string;
  vehicleRef: string;
  contactRef?: string;
  vin?: string;
  reason: CreateReason;
}

export interface AttachVehicle {
  vehicleRef: string;
  contactRef?: string;
  /** An existing profile id, or a CreateProfile.tempId from this plan. */
  customerId: string;
  /** Tie this PBS vehicle record to the profile (it was not yet). */
  addRef: boolean;
  /** The profile has only the last 8; record the full VIN on it. */
  fillVin?: string;
}

export interface DuplicateFlag {
  customerId: string;
  duplicateOf: string;
}

export interface VehicleProfilePlan {
  creates: CreateProfile[];
  attaches: AttachVehicle[];
  duplicates: DuplicateFlag[];
}

export const TEMP_ID_PREFIX = 'new:';

function choosePrimary(same: ProfileCandidate[], vin: string): ProfileCandidate {
  return [...same].sort((a, b) => {
    const exactA = cleanVin(a.vin) === vin ? 1 : 0;
    const exactB = cleanVin(b.vin) === vin ? 1 : 0;
    if (exactA !== exactB) return exactB - exactA;
    const linkedA = a.vehicleRefs.length > 0 ? 1 : 0;
    const linkedB = b.vehicleRefs.length > 0 ? 1 : 0;
    if (linkedA !== linkedB) return linkedB - linkedA;
    if (a.visitCount !== b.visitCount) return b.visitCount - a.visitCount;
    const ca = a.createdAt ?? '9999';
    const cb = b.createdAt ?? '9999';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  })[0];
}

export function planVehicleProfiles(
  vehicles: readonly RepairOrderVehicle[],
  facts: ReadonlyMap<string, VehicleFacts>,
  profiles: readonly ProfileCandidate[]
): VehicleProfilePlan {
  // Working copies, so each decision is seen by the ones after it.
  const working: ProfileCandidate[] = profiles.map((p) => ({
    ...p,
    vin: cleanVin(p.vin) || undefined,
    vehicleRefs: p.vehicleRefs.map(normalizeVehicleRef).filter(Boolean),
  }));
  const byTail = new Map<string, ProfileCandidate[]>();
  const index = (p: ProfileCandidate) => {
    const tail = cleanVin(p.vinLast8 || p.vin).slice(-8);
    if (tail.length !== 8) return;
    const list = byTail.get(tail) ?? [];
    if (!list.includes(p)) list.push(p);
    byTail.set(tail, list);
  };
  working.forEach(index);
  const byRef = new Map<string, ProfileCandidate>();
  for (const p of working) for (const r of p.vehicleRefs) byRef.set(r, p);

  // One decision per vehicle, in a stable order.
  const unique = new Map<string, RepairOrderVehicle>();
  for (const v of vehicles) {
    const key = normalizeVehicleRef(v.vehicleRef);
    if (key && !unique.has(key)) unique.set(key, v);
  }
  const ordered = [...unique.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const plan: VehicleProfilePlan = { creates: [], attaches: [], duplicates: [] };
  const flagged = new Set<string>();
  let nextTemp = 1;

  for (const [key, vehicle] of ordered) {
    // Already tied to a profile — possibly by an earlier decision in this plan.
    const tied = byRef.get(key);
    if (tied) {
      plan.attaches.push({ vehicleRef: vehicle.vehicleRef, contactRef: vehicle.contactRef, customerId: tied.id, addRef: false });
      continue;
    }

    const vin = cleanVin(facts.get(key)?.vin);
    const make = facts.get(key)?.make;

    const create = (reason: CreateReason) => {
      const tempId = `${TEMP_ID_PREFIX}${nextTemp++}`;
      plan.creates.push({
        tempId,
        vehicleRef: vehicle.vehicleRef,
        contactRef: vehicle.contactRef,
        vin: vin.length >= 8 ? vin : undefined,
        reason,
      });
      const made: ProfileCandidate = {
        id: tempId,
        vinLast8: vin.length >= 8 ? vin.slice(-8) : '',
        vin: vin.length === 17 ? vin : undefined,
        make: make,
        vehicleRefs: [key],
        visitCount: 0,
        createdAt: '9999',
      };
      working.push(made);
      index(made);
      byRef.set(key, made);
    };

    if (vin.length < 8) {
      create('no-vin');
      continue;
    }

    const tail = vin.slice(-8);
    const candidates = byTail.get(tail) ?? [];
    const same = candidates.filter((p) => {
      const pv = cleanVin(p.vin);
      if (pv.length === 17 && vin.length === 17) return pv === vin;
      // Only the last 8 to go on, and already tied to some other PBS car whose
      // VIN we can't see: it may be a different car with the same tail. Two
      // cars' histories mixed together is the thing to avoid, so it is not
      // treated as this car.
      if (pv.length !== 17 && p.vehicleRefs.length > 0) return false;
      return makesAgree(p.make, make);
    });

    if (same.length === 0) {
      create(candidates.length > 0 ? 'different-car' : 'no-profile');
      continue;
    }

    const primary = choosePrimary(same, vin);
    const fillVin = vin.length === 17 && cleanVin(primary.vin).length !== 17 ? vin : undefined;
    plan.attaches.push({
      vehicleRef: vehicle.vehicleRef,
      contactRef: vehicle.contactRef,
      customerId: primary.id,
      addRef: true,
      ...(fillVin ? { fillVin } : {}),
    });
    primary.vehicleRefs.push(key);
    byRef.set(key, primary);
    if (fillVin) primary.vin = fillVin;

    for (const other of same) {
      if (other.id === primary.id || other.id.startsWith(TEMP_ID_PREFIX) || flagged.has(other.id)) continue;
      flagged.add(other.id);
      plan.duplicates.push({ customerId: other.id, duplicateOf: primary.id });
    }
  }

  return plan;
}
