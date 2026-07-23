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

function sortMessages(rows: DealershipChatMessage[]): DealershipChatMessage[] {
  return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mergeMessages(...groups: DealershipChatMessage[][]): DealershipChatMessage[] {
  const merged = new Map<string, DealershipChatMessage>();
  for (const group of groups) {
    for (const message of group) {
      merged.set(message.id, message);
    }
  }
  return sortMessages([...merged.values()]);
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
      onData(
        sortMessages(
          snapshot.docs.map((docSnap) =>
            mapMessage(docSnap.id, docSnap.data() as Record<string, unknown>)
          )
        )
      );
    },
    (error) => onError?.(error)
  );
}

export function subscribeDealershipOutbox(
  dealershipId: string,
  uid: string,
  onData: (messages: DealershipChatMessage[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(
    messagesCollection(),
    where('dealershipId', '==', dealershipId),
    where('fromUid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(
        sortMessages(
          snapshot.docs.map((docSnap) =>
            mapMessage(docSnap.id, docSnap.data() as Record<string, unknown>)
          )
        )
      );
    },
    (error) => onError?.(error)
  );
}

/** All messages sent or received by this user at a dealership. */
export function subscribeDealershipConversations(
  dealershipId: string,
  uid: string,
  onData: (messages: DealershipChatMessage[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  let inbox: DealershipChatMessage[] = [];
  let outbox: DealershipChatMessage[] = [];

  const publish = () => onData(mergeMessages(inbox, outbox));

  const unsubInbox = subscribeDealershipInbox(dealershipId, uid, (rows) => {
    inbox = rows;
    publish();
  }, onError);

  const unsubOutbox = subscribeDealershipOutbox(dealershipId, uid, (rows) => {
    outbox = rows;
    publish();
  }, onError);

  return () => {
    unsubInbox();
    unsubOutbox();
  };
}

export interface ChatThreadSummary {
  threadKey: string;
  otherUid: string;
  otherName: string;
  lastMessage: DealershipChatMessage;
  unreadCount: number;
}

export function buildChatThreadSummaries(
  messages: DealershipChatMessage[],
  currentUid: string
): ChatThreadSummary[] {
  const byThread = new Map<string, DealershipChatMessage[]>();

  for (const message of messages) {
    const threadKey = message.threadKey || buildChatThreadKey(message.fromUid, message.toUid);
    const existing = byThread.get(threadKey) || [];
    existing.push(message);
    byThread.set(threadKey, existing);
  }

  const summaries: ChatThreadSummary[] = [];

  for (const [threadKey, threadMessages] of byThread) {
    const sorted = sortMessages(threadMessages);
    const lastMessage = sorted[sorted.length - 1];
    const otherUid = lastMessage.fromUid === currentUid ? lastMessage.toUid : lastMessage.fromUid;
    const otherName = lastMessage.fromUid === currentUid ? lastMessage.toName : lastMessage.fromName;
    const unreadCount = threadMessages.filter(
      (message) => message.toUid === currentUid && !message.dismissedAt
    ).length;

    summaries.push({
      threadKey,
      otherUid,
      otherName,
      lastMessage,
      unreadCount,
    });
  }

  return summaries.sort((a, b) =>
    b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt)
  );
}

export function subscribeDealershipThread(
  dealershipId: string,
  uid: string,
  otherUid: string,
  onData: (messages: DealershipChatMessage[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  let sent: DealershipChatMessage[] = [];
  let received: DealershipChatMessage[] = [];

  const publish = () => onData(mergeMessages(sent, received));

  const qSent = query(
    messagesCollection(),
    where('dealershipId', '==', dealershipId),
    where('fromUid', '==', uid),
    where('toUid', '==', otherUid)
  );

  const qReceived = query(
    messagesCollection(),
    where('dealershipId', '==', dealershipId),
    where('fromUid', '==', otherUid),
    where('toUid', '==', uid)
  );

  const unsubSent = onSnapshot(
    qSent,
    (snapshot) => {
      sent = sortMessages(
        snapshot.docs.map((docSnap) =>
          mapMessage(docSnap.id, docSnap.data() as Record<string, unknown>)
        )
      );
      publish();
    },
    (error) => onError?.(error)
  );

  const unsubReceived = onSnapshot(
    qReceived,
    (snapshot) => {
      received = sortMessages(
        snapshot.docs.map((docSnap) =>
          mapMessage(docSnap.id, docSnap.data() as Record<string, unknown>)
        )
      );
      publish();
    },
    (error) => onError?.(error)
  );

  return () => {
    unsubSent();
    unsubReceived();
  };
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
