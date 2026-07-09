import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { pbsLotGet, pbsVehicleGet } from './partnerHubClient.js';
import {
  commitBatches,
  dealershipSettingsDoc,
  inventoryVehicleDocId,
  serverTimestamp,
  stripUndefinedDeep,
  vehicleInventoryCollection,
} from './pbsFirestore.js';
import { vinLast8FromVin } from './pbsMappers.js';
import type { PbsInventoryVehicle, PbsLot } from './pbsExtendedTypes.js';
import { isInventoryPbsVehicle } from './pbsTechnicianAggregator.js';

export interface PbsInventoryLot {
  lotId: string;
  code: string;
  description: string;
}

export async function syncPbsVehicleInventory(
  db: Firestore,
  dealershipId: string,
  syncedAt: string
): Promise<{ lots: number; vehiclesFetched: number; vehiclesWritten: number }> {
  const [lotResponse, vehicleResponse] = await Promise.all([
    pbsLotGet({}),
    pbsVehicleGet({ IncludeInactive: false }),
  ]);

  const lotsRaw = (lotResponse.Lots || []) as PbsLot[];
  const lots: PbsInventoryLot[] = lotsRaw
    .filter((lot) => !lot.Inactive)
    .map((lot) => ({
      lotId: (lot.LotId || lot.Code || '').trim(),
      code: (lot.Code || '').trim(),
      description: (lot.Description || lot.Code || '').trim(),
    }))
    .filter((lot) => lot.lotId || lot.code);

  await dealershipSettingsDoc(db, dealershipId).set(
    stripUndefinedDeep({
      id: dealershipId,
      pbsInventoryLots: lots,
      pbsInventorySyncedAt: syncedAt,
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );

  const vehiclesRaw = (vehicleResponse.Vehicles || []) as PbsInventoryVehicle[];
  const inventoryVehicles = vehiclesRaw.filter(isInventoryPbsVehicle);

  const writes: Array<(batch: WriteBatch) => void> = [];

  for (const vehicle of inventoryVehicles) {
    const vehicleId = (vehicle.VehicleId || '').trim();
    const vin = (vehicle.VIN || '').replace(/\s/g, '').toUpperCase();
    if (!vehicleId && !vin) continue;

    const docId = inventoryVehicleDocId(vehicleId, vin);
    const ref = vehicleInventoryCollection(db).doc(docId);

    writes.push((batch) =>
      batch.set(
        ref,
        stripUndefinedDeep({
          dealershipId,
          pbsVehicleId: vehicleId || undefined,
          stockNumber: vehicle.StockNumber?.trim() || undefined,
          vin: vin || undefined,
          vinLast8: vinLast8FromVin(vin) || undefined,
          year: vehicle.Year?.trim() || undefined,
          make: vehicle.Make?.trim() || undefined,
          model: vehicle.Model?.trim() || undefined,
          status: vehicle.Status?.trim() || undefined,
          lot: vehicle.Lot?.trim() || undefined,
          lotDescription: vehicle.LotDescription?.trim() || undefined,
          lotRef: vehicle.LotRef?.trim() || undefined,
          odometer: vehicle.Odometer && vehicle.Odometer > 0 ? vehicle.Odometer : undefined,
          listedPrice: vehicle.ListedPrice && vehicle.ListedPrice > 0 ? vehicle.ListedPrice : undefined,
          ownerRef: vehicle.OwnerRef?.trim() || undefined,
          source: 'pbs-sync',
          pbsSyncedAt: syncedAt,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      )
    );
  }

  await commitBatches(db, writes);

  console.log(
    `[PBS Sync] Vehicle inventory: ${lots.length} lots, ${inventoryVehicles.length} inventory vehicles written (${vehiclesRaw.length} fetched)`
  );

  return {
    lots: lots.length,
    vehiclesFetched: vehiclesRaw.length,
    vehiclesWritten: inventoryVehicles.length,
  };
}
