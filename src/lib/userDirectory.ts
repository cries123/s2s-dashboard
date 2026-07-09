import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeUserProfile, userBelongsToTenant } from './rbac';
import { getTenantProfile } from './tenants';
import type { User } from '../types';

const USERS_PATH = 'artifacts/hyundai-sales-to-service/public/data/users';

function usersCollection() {
  return collection(db, USERS_PATH);
}

function mergeTenantUsers(
  scopeTenantId: string,
  byId: Map<string, User>
): User[] {
  return [...byId.values()].filter((u) => userBelongsToTenant(u, scopeTenantId));
}

/** Live user list for a tenant (tenantId query + legacy dealershipId merge). */
export function subscribeTenantUsers(
  scopeTenantId: string | undefined,
  onData: (users: User[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  if (!scopeTenantId) {
    return onSnapshot(
      usersCollection(),
      (snapshot) => {
        onData(
          snapshot.docs.map((docSnap) =>
            normalizeUserProfile({ uid: docSnap.id, ...docSnap.data() })
          )
        );
      },
      (error) => onError?.(error)
    );
  }

  const merged = new Map<string, User>();
  const dealershipId = getTenantProfile(scopeTenantId)?.dealershipId;
  let tenantReady = false;
  let legacyReady = !dealershipId;

  const publish = () => {
    if (!tenantReady || !legacyReady) return;
    onData(mergeTenantUsers(scopeTenantId, merged));
  };

  const unsubTenant = onSnapshot(
    query(usersCollection(), where('tenantId', '==', scopeTenantId)),
    (snapshot) => {
      snapshot.docs.forEach((docSnap) => {
        const user = normalizeUserProfile({ uid: docSnap.id, ...docSnap.data() });
        merged.set(user.uid, user);
      });
      tenantReady = true;
      publish();
    },
    (error) => onError?.(error)
  );

  let unsubLegacy: Unsubscribe = () => {};
  if (dealershipId) {
    unsubLegacy = onSnapshot(
      query(usersCollection(), where('dealershipId', '==', dealershipId)),
      (snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          const user = normalizeUserProfile({ uid: docSnap.id, ...docSnap.data() });
          if (userBelongsToTenant(user, scopeTenantId)) {
            merged.set(user.uid, user);
          }
        });
        legacyReady = true;
        publish();
      },
      (error) => onError?.(error)
    );
  }

  return () => {
    unsubTenant();
    unsubLegacy();
  };
}
