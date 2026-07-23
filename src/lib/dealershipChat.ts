import {
  addDoc,
  collection,
  onSnapshot,
  query,
  updateDoc,
  where,
  doc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { DealershipChatMessage } from '../types';

const CHAT_PATH = 'artifacts/hyundai-sales-to-service/public/data/dealershipChatMessages';

function messagesCollection() {
  return collection(db, CHAT_PATH);
}

export function buildChatThreadKey(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('__');
}

function mapMessage(id: string, data: Record<string, unknown>): DealershipChatMessage {
  return {
    id,
    dealershipId: String(data.dealershipId || ''),
    tenantId: typeof data.tenantId === 'string' ? data.tenantId : undefined,
    threadKey: String(data.threadKey || ''),
    fromUid: String(data.fromUid || ''),
    fromName: String(data.fromName || ''),
    toUid: String(data.toUid || ''),
    toName: String(data.toName || ''),
    body: String(data.body || ''),
    createdAt: String(data.createdAt || ''),
    readAt: typeof data.readAt === 'string' ? data.readAt : undefined,
    dismissedAt: typeof data.dismissedAt === 'string' ? data.dismissedAt : undefined,
  };
}

export async function sendDealershipChatMessage(input: {
  dealershipId: string;
  tenantId?: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  body: string;
}): Promise<string> {
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error('Message cannot be empty.');

  const createdAt = new Date().toISOString();
  const docRef = await addDoc(messagesCollection(), {
    dealershipId: input.dealershipId,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    threadKey: buildChatThreadKey(input.fromUid, input.toUid),
    fromUid: input.fromUid,
    fromName: input.fromName,
    toUid: input.toUid,
    toName: input.toName,
    body: trimmed.slice(0, 500),
    createdAt,
  });
  return docRef.id;
}

export function subscribeDealershipInbox(
  dealershipId: string,
  uid: string,
  onData: (messages: DealershipChatMessage[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(
    messagesCollection(),
    where('dealershipId', '==', dealershipId),
    where('toUid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((docSnap) => mapMessage(docSnap.id, docSnap.data() as Record<string, unknown>))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onData(rows);
    },
    (error) => onError?.(error)
  );
}

export function subscribeDealershipThread(
  dealershipId: string,
  uid: string,
  otherUid: string,
  onData: (messages: DealershipChatMessage[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const threadKey = buildChatThreadKey(uid, otherUid);
  const q = query(
    messagesCollection(),
    where('dealershipId', '==', dealershipId),
    where('threadKey', '==', threadKey)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((docSnap) => mapMessage(docSnap.id, docSnap.data() as Record<string, unknown>))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onData(rows);
    },
    (error) => onError?.(error)
  );
}

export async function dismissDealershipChatMessage(messageId: string): Promise<void> {
  await updateDoc(doc(db, CHAT_PATH, messageId), {
    dismissedAt: new Date().toISOString(),
    readAt: new Date().toISOString(),
  });
}

export async function markDealershipChatMessageRead(messageId: string): Promise<void> {
  await updateDoc(doc(db, CHAT_PATH, messageId), {
    readAt: new Date().toISOString(),
  });
}
