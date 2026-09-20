import { Timestamp } from 'firebase/firestore';
import type {
  Customer,
  DealershipSettings,
  DispatchRepairOrder,
  ScheduledAppointmentSlot,
  ServiceVisit,
  User,
} from '../types';
import { getDispatchDatePst } from './dispatchPst';

const previewNow = Timestamp.now();

const PREVIEW_SERVICE_VISITS: ServiceVisit[] = [
  {
    id: 'pbs-117892',
    soNumber: '117892',
    date: '2026-07-07',
    mileage: 10393,
    advisor: 'LV4278',
    status: 'Cashiered',
    requests:
      'HYUNDAI COMPLIMENTARY MAINTENANCE; CAMPAIGN 304 INSTRUMENT CLUSTER S/W UPD; CAR WASH REQUESTED',
    createdAt: previewNow,
    lines: [
      {
        lineNumber: 1,
        requestCode: 'LOF',
        concern: 'HYUNDAI COMPLIMENTARY MAINTENANCE — PERFORM FULL SYNTHETIC OIL & FILTER CHANGE',
        cause: 'Scheduled maintenance due at 10,000 miles.',
        correction: 'Replaced engine oil and filter, performed multi-point inspection, set tire pressures.',
        tech: '70',
        status: 'Completed',
        labourLines: [
          { opCode: 'LOF', description: 'Lube oil & filter', soldHours: 0.4, tech: '70', price: 0 },
          { opCode: 'MPI', description: 'Multi-point inspection', soldHours: 0.2, tech: '70', price: 0 },
        ],
        partLines: [
          { partNumber: '26350-2M000', description: 'Oil filter cartridge', qty: 1, price: 12.5 },
          { partNumber: '00232-19010', description: '0W-20 synthetic oil (qt)', qty: 6, price: 54 },
        ],
      },
      {
        lineNumber: 2,
        requestCode: 'C304',
        concern: 'CAMPAIGN 304 INSTRUMENT CLUSTER S/W UPDATE (26-01-054H)',
        cause: 'Open factory campaign on VIN.',
        correction: 'Performed instrument cluster software update per campaign 304 procedure.',
        tech: '70',
        status: 'Completed',
        labourLines: [
          { opCode: '304A', description: 'Campaign 304 cluster update', soldHours: 0.3, tech: '70', price: 42 },
        ],
      },
      {
        lineNumber: 3,
        concern: 'CAR WASH REQUESTED',
        correction: 'Complimentary wash completed.',
        status: 'Completed',
      },
    ],
  },
  {
    id: 'pbs-115204',
    soNumber: '115204',
    date: '2026-02-18',
    mileage: 6120,
    advisor: 'FRANK',
    status: 'Cashiered',
    requests: 'CUSTOMER STATES A/C NOT BLOWING COLD; ROTATE TIRES',
    createdAt: previewNow,
  },
];

export const PREVIEW_CUSTOMERS: Customer[] = [
  {
    id: 'preview-cust-manion',
    firstName: '',
    lastName: 'Manion',
    phone: '',
    email: '',
    make: 'Ford',
    model: 'F-150',
    year: '2022',
    vinLast8: 'G2054992',
    soldDate: '2023-01-15',
    language: 'English',
    enableServiceAlert: false,
    serviceAlertTriggered: false,
    createdAt: previewNow,
    addedBy: 'preview-user',
    dealershipId: 'ford',
    addedByUsername: 'Preview User',
    lastServiceDate: '2026-07-07',
    recentVisits: PREVIEW_SERVICE_VISITS,
  },
  // Enough alert customers to show the call list in a realistic state rather
  // than an empty shell. Invented people — never real customer records.
  ...([
    { last: 'Alvarado Whitfield', first: 'Marguerite', phone: '(805) 555-0142', year: '2025', model: 'Tucson', vin: 'SE014402', lastVisit: '2026-03-19' },
    { last: 'Boone', first: 'Dell', phone: '(805) 555-0118', year: '2024', model: 'Tucson Hybrid', vin: 'RU158310', lastVisit: '2026-03-21' },
    { last: 'Okonkwo', first: 'Ada', phone: '(805) 555-0190', year: '2019', model: 'Veloster', vin: 'KU006271', lastVisit: '2026-01-08', language: 'Spanish' },
    { last: 'Reyes', first: 'Sol', phone: '(805) 555-0176', year: '2021', model: 'Sonata', vin: 'LH229045', lastVisit: '2025-11-30' },
    { last: 'Vandermeer', first: 'Cy', phone: '', year: '2023', model: 'Palisade', vin: 'MP447719', lastVisit: '2026-04-02' },
  ] as const).map((p, i) => ({
    id: `preview-alert-${i}`,
    firstName: p.first,
    lastName: p.last,
    phone: p.phone,
    email: '',
    make: 'Hyundai',
    model: p.model,
    year: p.year,
    vinLast8: p.vin,
    soldDate: p.lastVisit,
    language: (p as { language?: string }).language ?? 'English',
    enableServiceAlert: true,
    serviceAlertTriggered: false,
    createdAt: previewNow,
    addedBy: 'preview-user',
    dealershipId: 'hyundai',
    addedByUsername: 'Preview User',
    lastServiceDate: p.lastVisit,
    // The alert engine reads visit history, not just lastServiceDate — without a
    // visit these read "no visits on record" and date off the sold date instead.
    recentVisits: [
      {
        id: `preview-visit-${i}`,
        soNumber: `20${140 + i}`,
        date: p.lastVisit,
        mileage: 12000 + i * 3100,
        advisor: 'LV4278',
        status: 'Cashiered',
        requests: 'SYNTHETIC OIL AND FILTER CHANGE; MULTI POINT INSPECTION',
        createdAt: previewNow,
        lines: [],
      },
    ],
  })),
];

/** Day-schedule fixtures for the preview scheduler grid. */
export function buildPreviewDaySchedule(): ScheduledAppointmentSlot[] {
  const slot = (
    id: string,
    startMinutes: number,
    durationMinutes: number,
    techNumber: string,
    customerName: string,
    vehicleLabel: string,
    concern: string,
    category: ScheduledAppointmentSlot['category'],
    isWaiter = false
  ): ScheduledAppointmentSlot => ({
    id,
    appointmentNumber: id.replace(/\D/g, ''),
    startMinutes,
    durationMinutes,
    techNumber,
    advisor: 'LEMMY LV4278',
    customerName,
    vehicleLabel,
    status: 'Open',
    concern,
    category,
    isWaiter,
  });

  return [
    slot('appt-95710', 8 * 60, 60, '64', 'RAMOS, CRYSTAL', '2024 HYUNDAI TUCSON', 'PERFORM FULL SYNTHETIC OIL & FILTER CHANGE', 'oilChange', true),
    slot('appt-95711', 9 * 60 + 30, 90, '64', 'CHEN, MARCUS', '2023 HYUNDAI SONATA', 'CUSTOMER STATES GRINDING NOISE WHEN BRAKING', 'diagnosis'),
    slot('appt-95712', 13 * 60, 60, '64', 'WILLIAMS, DANA', '2022 HYUNDAI KONA', 'TIRE ROTATION AND BALANCE', 'oilChange'),
    slot('appt-95713', 8 * 60 + 15, 45, '66', 'ZEPEDA, MAT', '2015 HYUNDAI SONATA', 'A/C NOT BLOWING COLD — CHECK AND ADVISE', 'diagnosis'),
    slot('appt-95714', 10 * 60 + 30, 120, '66', 'GARCIA, LUIS', '2021 HYUNDAI PALISADE', 'CAMPAIGN 304 INSTRUMENT CLUSTER S/W UPDATE', 'recall'),
    slot('appt-95715', 15 * 60, 60, '66', 'PATEL, RAVI', '2025 HYUNDAI SANTA FE', 'FIRST SERVICE — COMPLIMENTARY MAINTENANCE', 'oilChange'),
    slot('appt-95716', 9 * 60, 60, '70', 'THOMPSON, KIM', '2020 HYUNDAI ELANTRA', 'RECALL 302 FRONT VIEW CAMERA FCA UPDATE', 'recall'),
    slot('appt-95717', 11 * 60 + 30, 60, '70', 'NGUYEN, LINH', '2024 HYUNDAI IONIQ 5', 'CHECK ENGINE LIGHT ON — DIAGNOSE', 'diagnosis', true),
    slot('appt-95718', 14 * 60, 30, '70', 'LOPEZ, ANA', '2023 HYUNDAI VENUE', 'OIL CHANGE + RECALL 302 COMBINED VISIT', 'oilChange'),
    slot('appt-95719', 10 * 60, 60, '', 'RIVERA, SOFIA', '2022 HYUNDAI SANTA CRUZ', 'SECOND OPINION ON SUSPENSION NOISE', 'misc'),
  ];
}

export const PREVIEW_USER: User = {
  uid: 'preview-user',
  email: 'preview@local.dev',
  username: 'Preview User',
  role: 'admin',
  jobTitle: 'Preview',
  status: 'approved',
  dealershipId: 'ford',
};

export function buildPreviewDispatchOrders(
  dealershipId: string,
  businessDate: string
): DispatchRepairOrder[] {
  const base = {
    dealershipId,
    lifecycleStatus: 'active' as const,
    status: 'WIP' as const,
    isCompleted: false,
    isWaiting: false,
    isPdl: false,
    dateCreated: businessDate,
    lastUpdated: new Date().toISOString(),
  };

  return [
    {
      ...base,
      id: 'preview-queue-1',
      roNumber: '883710',
      techNumber: '8508',
      tagNumber: 'A-100',
      customerLastName: 'Martinez',
      customerName: 'Martinez',
      department: 'unassigned',
      currentLaneId: 'unassigned',
      concern: 'Oil change and tire rotation',
    },
    {
      ...base,
      id: 'preview-lube-1',
      roNumber: '883715',
      techNumber: '8485',
      tagNumber: '8082',
      customerLastName: 'Manion',
      customerName: 'MANION',
      department: 'lube',
      currentLaneId: 'lube',
      promiseTimeAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      concern: 'Check engine light — customer reports rough idle',
    },
    {
      ...base,
      id: 'preview-lube-2',
      roNumber: '883720',
      techNumber: '8485',
      tagNumber: '8090',
      customerLastName: 'Chen',
      customerName: 'Chen',
      department: 'lube',
      currentLaneId: 'lube',
      status: 'POO',
      isWaiting: true,
      promiseTimeAt: new Date(Date.now() + 90 * 60_000).toISOString(),
    },
    {
      ...base,
      id: 'preview-quick-1',
      roNumber: '883725',
      techNumber: '7178',
      tagNumber: 'B-220',
      customerLastName: 'Williams',
      customerName: 'Williams',
      department: 'quick_service',
      currentLaneId: 'quick_service',
    },
    {
      ...base,
      id: 'preview-heavy-1',
      roNumber: '883801',
      techNumber: '8510',
      tagNumber: 'C-441',
      customerLastName: 'Garcia',
      customerName: 'Garcia',
      department: 'heavyline',
      currentLaneId: 'heavyline',
    },
    {
      ...base,
      id: 'preview-heavy-2',
      roNumber: '883812',
      techNumber: '8512',
      tagNumber: 'C-455',
      customerLastName: 'Thompson',
      customerName: 'Thompson',
      department: 'heavyline',
      currentLaneId: 'heavyline',
    },
    {
      ...base,
      id: 'preview-diesel-1',
      roNumber: '883830',
      techNumber: '8520',
      tagNumber: 'D-118',
      vinLastEight: 'A1234567',
      customerLastName: 'Rivera',
      customerName: 'Rivera',
      department: 'diesel',
      currentLaneId: 'diesel',
    },
    {
      ...base,
      id: 'preview-trans-1',
      roNumber: '883845',
      techNumber: '8533',
      tagNumber: 'E-902',
      customerLastName: 'Patel',
      customerName: 'Patel',
      department: 'trans',
      currentLaneId: 'trans',
      concern: 'Transmission slip under load',
    },
    {
      ...base,
      id: 'preview-down-1',
      roNumber: '883860',
      techNumber: '8402',
      tagNumber: 'F-330',
      customerLastName: 'Lopez',
      customerName: 'Lopez',
      department: 'down_in_shop',
      currentLaneId: 'down_in_shop',
      concern: 'Head gasket — waiting on parts',
    },
    {
      ...base,
      id: 'preview-done-1',
      roNumber: '883700',
      techNumber: '8485',
      tagNumber: 'Z-001',
      customerLastName: 'Nguyen',
      customerName: 'Nguyen',
      department: 'lube',
      currentLaneId: 'lube',
      isCompleted: true,
    },
  ];
}

export const PREVIEW_DEALERSHIP_SETTINGS: Partial<DealershipSettings> = {
  id: 'ford',
  appointmentTarget: 20,
};
