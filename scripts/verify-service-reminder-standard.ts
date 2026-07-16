import assert from 'node:assert/strict';
import { isServiceAlertActive, resolveServiceAlertConfig } from '../src/lib/alerts.ts';
import {
  computeServiceReminderDueDate,
  getStandardServiceReminderDueDate,
} from '../src/lib/serviceReminder.ts';

const standard = resolveServiceAlertConfig({ serviceAlertMode: 'standard' });
const now = new Date('2026-07-16T12:00:00');

const baseCustomer = {
  enableServiceAlert: true,
  soldDate: '2026-06-30',
  createdAt: { toDate: () => new Date('2026-07-07T00:00:00') },
};

assert.equal(computeServiceReminderDueDate('2026-06-30'), '2026-12-30');

const deliveryDue = getStandardServiceReminderDueDate(baseCustomer);
assert.equal(deliveryDue, '2026-12-30');

assert.equal(
  isServiceAlertActive(baseCustomer, standard, now),
  false,
  'standard: delivery + 6mo should not alert in July'
);

const pbsPastDue = {
  ...baseCustomer,
  serviceReminderDueDate: '2026-06-30',
  pbsReminderSyncedAt: '2026-07-16T00:00:00Z',
};

assert.equal(
  getStandardServiceReminderDueDate(pbsPastDue),
  '2026-12-30',
  'standard: ignore PBS workplan due date without contact log'
);
assert.equal(
  isServiceAlertActive(pbsPastDue, standard, now),
  false,
  'standard: PBS past due must not trigger alert before delivery + 6mo'
);

const afterContact = {
  ...baseCustomer,
  lastServiceContact: { seconds: Math.floor(now.getTime() / 1000) },
  serviceReminderDueDate: '2027-01-16',
};

assert.equal(
  getStandardServiceReminderDueDate(afterContact),
  '2027-01-16',
  'standard: honor contact-log reset date'
);

console.log('serviceReminder tests OK');
