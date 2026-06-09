import { Timestamp } from 'firebase/firestore';
import type { Customer, DealershipSettings, DispatchRepairOrder, User } from '../types';
import { getDispatchDatePst } from './dispatchPst';

const previewNow = Timestamp.now();
const today = getDispatchDatePst();

export const PREVIEW_CUSTOMERS: Customer[] = [
  {
    id: 'preview-cust-manion',
    firstName: '',
    lastName: 'Manion',
    phone: '',
    email: '',
    make: 'Hyundai',
    model: 'Tucson',
    year: '2022',
    vinLast8: 'G2054992',
    soldDate: '2023-01-15',
    language: 'English',
    enableServiceAlert: false,
    serviceAlertTriggered: false,
    createdAt: previewNow,
    addedBy: 'preview-user',
    dealershipId: 'hyundai',
  },
];

export const PREVIEW_USER: User = {
  uid: 'preview-user',
  email: 'preview@local.dev',
  username: 'Preview User',
  role: 'admin',
  jobTitle: 'Preview',
  status: 'approved',
  dealershipId: 'hyundai',
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
  ];
}

export const PREVIEW_DEALERSHIP_SETTINGS: Partial<DealershipSettings> = {
  id: 'hyundai',
  appointmentTarget: 20,
};
