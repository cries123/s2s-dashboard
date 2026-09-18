import { addDoc, collection, deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Customer, User } from '../types';
import { calculateServiceCycle, computeContactClearDueDate, type ServiceAlertConfig } from './alerts';

export interface LogContactInput {
  outcome: string;
  notes: string;
  appointmentSet: boolean;
}

const CUSTOMERS = ['artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'] as const;

/**
 * Record a call against a customer and clear their alert. Shared by the card view
 * and the call-list table so both write exactly the same shape.
 */
export async function logCustomerContact(
  customer: Customer,
  actor: Pick<User, 'uid' | 'username'>,
  input: LogContactInput,
  config: ServiceAlertConfig
): Promise<string> {
  await addDoc(collection(db, ...CUSTOMERS, customer.id, 'contactLog'), {
    timestamp: serverTimestamp(),
    userId: actor.uid,
    username: actor.username,
    outcome: input.outcome,
    notes: input.notes,
    appointmentSet: input.appointmentSet,
  });

  const nextDue = computeContactClearDueDate(customer, config);

  await updateDoc(doc(db, ...CUSTOMERS, customer.id), {
    lastServiceContact: serverTimestamp(),
    lastContactOutcome: input.outcome,
    lastContactUserId: actor.uid,
    lastContactUsername: actor.username,
    lastAcknowledgedCycle: calculateServiceCycle(customer.soldDate, config.intervalDays),
    serviceAlertTriggered: false,
    serviceReminderDueDate: nextDue,
    serviceAlertOverrideDate: deleteField(),
    serviceAlertHoldUntil: deleteField(),
  });

  return nextDue;
}
