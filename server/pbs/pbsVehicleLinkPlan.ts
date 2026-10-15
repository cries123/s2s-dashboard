/**
 * Linking a customer to their PBS vehicle from a repair order.
 *
 * A repair order can only attach to a customer already linked to its PBS
 * vehicle. The sync used to make that link in one place only — when PBS's bulk
 * customer list included the car — and that list came back with 1,251 vehicles
 * against 9,955 Hyundai customers. 7,641 customers were never linked, so none of
 * their repair orders could ever attach, however many times the sync ran. That
 * is why an imported customer like Steven Reyes showed a thin spreadsheet row
 * while PBS held the full repair order.
 *
 * This links from the other end. Every repair order names its vehicle; for one
 * that matches nobody, PBS is asked for that vehicle's VIN, and the customer is
 * found by the last 8 characters — which every imported record has.
 *
 * It refuses rather than guesses. A wrong link would put one person's service
 * history on another person's record, which is worse than no link. So:
 *
 *   - no VIN from PBS                      → not linked
 *   - nobody with those last 8             → not linked
 *   - the only match is already tied to a different PBS vehicle → not linked
 *   - more than one unlinked match          → not linked (ambiguous)
 *   - two PBS vehicles claim one customer   → neither linked (ambiguous)
 *   - makes disagree, when both are known   → not linked
 *   - the customer has a full VIN that differs → not that customer
 *
 * Pure — no Firestore, no PBS — so every one of those rules is tested directly.
 */

export const normalizeVehicleRef = (ref: unknown): string =>
  String(ref ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const cleanVin = (vin: unknown): string => String(vin ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const cleanMake = (make: unknown): string => String(make ?? '').toUpperCase().replace(/[^A-Z]/g, '');

export interface UnlinkedVehicle {
  /** As PBS sent it on the repair order. */
  vehicleRef: string;
  contactRef?: string;
}

export interface PbsVehicleFacts {
  vin?: string;
  make?: string;
}

export interface LinkableCustomer {
  id: string;
  /** Last 8 of the VIN, as stored on the customer. */
  vinLast8: string;
  /** Full VIN when the customer has one. */
  vin?: string;
  make?: string;
  /** Already linked to this PBS vehicle, if any. */
  pbsVehicleId?: string;
}

export type LinkOutcome =
  | 'linked'
  | 'no-vin'
  | 'no-customer'
  | 'already-linked-elsewhere'
  | 'make-mismatch'
  | 'ambiguous';

export interface VehicleLink {
  vehicleRef: string;
  contactRef?: string;
  customerId: string;
  vin: string;
}

export interface VehicleLinkPlan {
  links: VehicleLink[];
  outcomes: Record<LinkOutcome, number>;
  /** Why each vehicle did or did not link, keyed by normalised ref. */
  byRef: Map<string, LinkOutcome>;
}

/** Group customers by the last 8 of their VIN. More than one per key is kept — that is the point. */
export function indexCustomersByVinLast8(customers: Iterable<LinkableCustomer>): Map<string, LinkableCustomer[]> {
  const out = new Map<string, LinkableCustomer[]>();
  for (const c of customers) {
    const key = cleanVin(c.vinLast8 || c.vin).slice(-8);
    if (key.length !== 8) continue;
    const list = out.get(key) ?? [];
    list.push(c);
    out.set(key, list);
  }
  return out;
}

export function planVehicleLinks(
  vehicles: readonly UnlinkedVehicle[],
  facts: ReadonlyMap<string, PbsVehicleFacts>,
  customersByVinLast8: ReadonlyMap<string, LinkableCustomer[]>
): VehicleLinkPlan {
  const outcomes: Record<LinkOutcome, number> = {
    linked: 0,
    'no-vin': 0,
    'no-customer': 0,
    'already-linked-elsewhere': 0,
    'make-mismatch': 0,
    ambiguous: 0,
  };
  const byRef = new Map<string, LinkOutcome>();

  // One decision per vehicle, however many repair orders it has.
  const unique = new Map<string, UnlinkedVehicle>();
  for (const v of vehicles) {
    const key = normalizeVehicleRef(v.vehicleRef);
    if (key && !unique.has(key)) unique.set(key, v);
  }

  const tentative = new Map<string, { vehicle: UnlinkedVehicle; customer: LinkableCustomer; vin: string }>();
  for (const [key, vehicle] of unique) {
    const vin = cleanVin(facts.get(key)?.vin);
    if (vin.length < 8) {
      byRef.set(key, 'no-vin');
      continue;
    }
    const candidates = (customersByVinLast8.get(vin.slice(-8)) ?? []).filter(
      // A customer with a full VIN must match it in full, not just the tail.
      (c) => !(cleanVin(c.vin).length === 17 && vin.length === 17 && cleanVin(c.vin) !== vin)
    );
    if (candidates.length === 0) {
      byRef.set(key, 'no-customer');
      continue;
    }
    const unlinked = candidates.filter((c) => !c.pbsVehicleId);
    if (unlinked.length === 0) {
      byRef.set(key, 'already-linked-elsewhere');
      continue;
    }
    if (unlinked.length > 1) {
      byRef.set(key, 'ambiguous');
      continue;
    }
    const customer = unlinked[0];
    const pbsMake = cleanMake(facts.get(key)?.make);
    const ourMake = cleanMake(customer.make);
    if (pbsMake && ourMake && !pbsMake.startsWith(ourMake) && !ourMake.startsWith(pbsMake)) {
      byRef.set(key, 'make-mismatch');
      continue;
    }
    tentative.set(key, { vehicle, customer, vin });
  }

  // Two different PBS vehicles pointing at one customer: link neither.
  const claims = new Map<string, number>();
  for (const { customer } of tentative.values()) claims.set(customer.id, (claims.get(customer.id) ?? 0) + 1);

  const links: VehicleLink[] = [];
  for (const [key, t] of tentative) {
    if ((claims.get(t.customer.id) ?? 0) > 1) {
      byRef.set(key, 'ambiguous');
      continue;
    }
    byRef.set(key, 'linked');
    links.push({
      vehicleRef: t.vehicle.vehicleRef,
      contactRef: t.vehicle.contactRef,
      customerId: t.customer.id,
      vin: t.vin,
    });
  }

  for (const outcome of byRef.values()) outcomes[outcome] += 1;
  return { links, outcomes, byRef };
}
