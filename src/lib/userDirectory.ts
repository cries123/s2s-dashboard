import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeUserProfile, userBelongsToTenant } from './rbac';
import { getTenantProfile, tenantIdFromDealershipId } from './tenants';
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

/** Approved teammates at a dealership — for chat recipient lists. */
export function subscribeDealershipUsers(
  dealershipId: string | undefined,
  onData: (users: User[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  if (!dealershipId) {
    onData([]);
    return () => {};
  }
  return subscribeTenantUsers(tenantIdFromDealershipId(dealershipId), onData, onError);
}

export function isDealershipChatEligible(user: User): boolean {
  if (user.status === 'rejected' || user.role === 'pending') return false;
  if (user.approved === true || user.status === 'approved') return true;
  if (user.role === 'admin') return true;
  if (user.role === 'manager' || user.role === 'Manager' || user.isManager) return true;
  return false;
}
