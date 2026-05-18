import { Timestamp } from "firebase/firestore";

export type Role = 'admin' | 'Manager' | 'Salesperson' | 'Service Advisor' | 'Staff';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  uid: string;
  email: string;
  username: string;
  role: Role;
  jobTitle: string;
  status: UserStatus;
  dealershipId?: string;
  isManager?: boolean;
  createdAt?: Timestamp;
}

export interface Dealership {
  id: string;
  name: string;
  code: string;
  createdAt: Timestamp;
}

export interface DealershipSettings {
  id: string;
  appointmentTarget: number;
  laborGrossTarget?: number;
  updatedAt: Timestamp;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  make: string;
  model: string;
  year?: string;
  vinLast8: string;
  mileage?: string;
  soldDate: string;
  language: string;
  enableServiceAlert: boolean;
  serviceAlertTriggered: boolean;
  lastServiceContact?: Timestamp;
  lastContactOutcome?: string;
  lastContactUserId?: string;
  lastContactUsername?: string;
  lastAcknowledgedCycle?: number;
  lastServiceDate?: string;
  stopAlertInfo?: {
    reason: string;
    notes: string;
    stoppedBy: string;
    stoppedAt: Timestamp;
  };
  soldByUserId?: string | null;
  soldByUsername?: string | null;
  createdAt: Timestamp;
  addedBy: string;
  addedByUsername: string;
  dealershipId?: string;
}

export interface ContactLog {
  id: string;
  timestamp: Timestamp;
  userId: string;
  username: string;
  outcome: string;
  notes: string;
  appointmentSet: boolean;
}

export interface Appointment {
  id: string;
  date: string;
  type: 'Oil Change' | 'Recall' | 'Diag' | 'Service';
  reasons: string[];
  customerId: string;
  mileage?: string | null;
  addedBy: string;
  timestamp: Timestamp;
}

export interface DailyStat {
  id: string;
  date: string;
  count: number;
  dealershipId?: string;
  updatedAt: Timestamp;
  breakdown?: {
    diagnosis: number;
    oilChange: number;
    recall: number;
    misc: number;
  };
}
