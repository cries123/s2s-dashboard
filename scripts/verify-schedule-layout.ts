/**
 * Verifies day schedule layout (lanes + grid bounds).
 * Run: npx tsx scripts/verify-schedule-layout.ts
 */
import {
  layoutColumnAppointments,
  resolveScheduleGridBounds,
} from '../src/lib/appointmentSchedule.ts';
import type { ScheduledAppointmentSlot } from '../src/types.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const sample: ScheduledAppointmentSlot[] = [
  {
    id: 'a1',
    appointmentNumber: '1',
    startMinutes: 7 * 60,
    durationMinutes: 60,
    techNumber: '70',
    advisor: 'Frank',
    customerName: 'ONE',
    vehicleLabel: 'CAR',
    status: 'Open',
    concern: '',
    category: 'misc',
    isWaiter: false,
  },
  {
    id: 'a2',
    appointmentNumber: '2',
    startMinutes: 7 * 60 + 15,
    durationMinutes: 60,
    techNumber: '70',
    advisor: 'Frank',
    customerName: 'TWO',
    vehicleLabel: 'CAR',
    status: 'Open',
    concern: '',
    category: 'misc',
    isWaiter: false,
  },
  {
    id: 'a3',
    appointmentNumber: '3',
    startMinutes: 3 * 60,
    durationMinutes: 60,
    techNumber: '90',
    advisor: 'Frank',
    customerName: 'EARLY',
    vehicleLabel: 'CAR',
    status: 'Open',
    concern: '',
    category: 'misc',
    isWaiter: false,
  },
];

const bounds = resolveScheduleGridBounds(sample);
assert(bounds.startMinutes <= 6 * 60, 'grid expands earlier than default 7am start');

const lanes = layoutColumnAppointments(sample, '70', bounds.startMinutes);
assert(lanes.length === 2, 'overlapping same-tech appointments use separate lanes');
assert(lanes[0].lane !== lanes[1].lane, 'lane indices differ for overlaps');
assert(lanes[0].laneCount >= 2, 'lane count reflects overlap width');

console.log('Verification PASSED — schedule layout');
