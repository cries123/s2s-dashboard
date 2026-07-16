import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, deleteField, where, setDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { User, Role, UserStatus } from '../../../types';
import { 
  Users, 
  Shield, 
  CheckCircle, 
  XCircle, 
  Trash2, 
  Clock, 
  Search,
  ChevronDown,
  UserCheck,
  UserX,
  Target,
  FileText,
  Loader2,
  Database,
  SlidersHorizontal,
  Trophy,
  Lightbulb
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PageHeader } from '../../layout/PageHeader';

import { DEALERSHIPS } from '../../../constants';
import { DMS_PROVIDERS, normalizeDmsProvider, type DmsProviderId } from '../../../constants/dmsProviders';
import { defaultDmsProviderForDealership } from '../../../constants/dealerDefaults';
import { PBS_SYNC_DEALERSHIP_NAME } from '../../../lib/pbsSyncScope';
import { buildDmsProviderSettingsPatch } from '../../../lib/dealershipDmsSettings';
import { dispatchTechRosterForDealership } from '../../../constants/dispatchTechDefaults';
import { isCrossDealershipDispatchRoster } from '../../../lib/dispatchTechRoster';
import { DISPATCH_PRODUCTION_LANES, DEFAULT_DISPATCH_LANE_CAPACITY, mergeLaneCapacity, DispatchProductionLane } from '../../../lib/dispatchConfig';
import { useAuth } from '../../../hooks/useAuth';
import { SystemLogs } from './SystemLogs';
import { MasterUserSettings } from './MasterUserSettings';
import { AiUsageLogsPanel } from './AiUsageLogsPanel';
import { SuggestionsPanel } from './SuggestionsPanel';
import { SettingsPage } from '../../settings/SettingsPage';
import { DealershipAnnouncementSettings } from './DealershipAnnouncementSettings';
import { DmsImportHealthPanel } from './DmsImportHealthPanel';
import { PbsSyncPanel } from './PbsSyncPanel';
import { PbsSyncLogsPanel } from './PbsSyncLogsPanel';
import { ManagerOperationsConfig } from './ManagerOperationsConfig';
import { StoreWorkspaceDefaultsSettings } from './StoreWorkspaceDefaultsSettings';
import { ManagerPermissionsMatrix } from './ManagerPermissionsMatrix';
import type { DealershipAnnouncement } from '../../../types';
import { LandingTab } from '../../../types';
import { logSystemAction } from '../../../services/loggingService';
import {
  buildUserApprovalPatch,
  isManager,
  isPlatformAdmin,
  normalizeUserProfile,
  resolveUserTenantId,
  userBelongsToTenant,
  isPendingUser,
  canModifyUser,
  isPendingManagerEnrollment,
  isPendingStaffEnrollment,
  isPrimaryAdmin,
  isProtectedUser,
  buildManagerAdminRolePatch,
  managerAdminPermissionFromUser,
  type ManagerAdminPermission,
} from '../../../lib/rbac';
import { getTenantProfile, tenantIdFromDealershipId } from '../../../lib/tenants';
import {
  getDealershipStaffConfig,
  slugifyStaffName,
  type CompetitionAdvisorSlot,
  type CompetitionTechnicianSlot,
  type PerformanceAdvisorSlot,
} from '../../../lib/dealershipStaff';


type AdminSubTab =
  | 'operations'
  | 'users'
  | 'logs'
  | 'preferences'
  | 'master-users'
  | 'ai-usage'
  | 'suggestions'
  | 'enrollments'
  | 'import-health'
  | 'pbs-sync';

function getPanelSectionMeta(
  subTab: AdminSubTab,
  panelMode: 'admin' | 'manager' | 'full'
): { eyebrow: string; title: string; description: string } {
  const scope =
    panelMode === 'admin' ? 'Admin settings' : panelMode === 'manager' ? 'Manager settings' : 'System administration';

  switch (subTab) {
    case 'operations':
      return {
        eyebrow: scope,
        title: 'Dealership Configuration',
        description: 'DMS, dispatch, and competition settings for this store.',
      };
    case 'preferences':
      return {
        eyebrow: scope,
        title: 'Workspace Preferences',
        description: 'Personal workspace settings for contact workflow, modules, and CRM display.',
      };
    case 'users':
      return {
        eyebrow: scope,
        title: 'User Administration',
        description:
          panelMode === 'manager'
            ? 'Approve enrollments and manage sales and service staff permissions for this store.'
            : 'Dealership user administration has moved to Manager → User administration.',
      };
    case 'ai-usage':
      return {
        eyebrow: scope,
        title: 'AI Usage Logs',
        description: 'Token usage from automated PDF and DMS parse routes.',
      };
    case 'suggestions':
      return {
        eyebrow: scope,
        title: 'User Suggestions',
        description: 'Feedback submitted from the suggestion icon in the top bar.',
      };
    case 'master-users':
      return {
        eyebrow: scope,
        title: 'Master User Settings',
        description: 'Cross-dealership accounts, platform announcements, and system admin access.',
      };
    case 'enrollments':
      return {
        eyebrow: scope,
        title: 'Enrollment Queues',
        description: 'Manager enrollments are approved under Manager → User administration.',
      };
    case 'import-health':
      return {
        eyebrow: scope,
        title: 'DMS Import Health',
        description: 'Last successful PDF parse and recent failures per dealership.',
      };
    case 'pbs-sync':
      return {
        eyebrow: scope,
        title: 'PBS Data Sync',
        description: 'Pull customers, service history, and appointments from PartnerHUB.',
      };
    case 'logs':
      return {
        eyebrow: scope,
        title: panelMode === 'manager' ? 'Dealership Logs' : 'Audit Logs',
        description:
          panelMode === 'manager'
            ? 'Tenant-specific audit trail for this dealership only.'
            : 'User action audit trail and PBS PartnerHUB sync history.',
      };
    default:
      return {
        eyebrow: scope,
        title: 'System Administration',
        description: 'Secure administrative controls for this dealership.',
      };
  }
}

interface AdminPanelProps {
  key?: string;
  panelMode?: 'admin' | 'manager' | 'full';
  currentDealershipId?: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
  activeSubTab?: AdminSubTab;
  onChangeSubTab?: (tab: AdminSubTab) => void;
  onNavigateTab?: (tab: LandingTab) => void;
  onDealershipChange?: (dealershipId: string) => void;
}

export default function AdminPanel({ 
  panelMode = 'full',
  currentDealershipId, 
  onSuccess, 
  onError, 
  activeSubTab, 
  onChangeSubTab,
  onNavigateTab,
  onDealershipChange
}: AdminPanelProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dealershipSettings, setDealershipSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!currentUser) return;

    // Subscribe to all settings docs; UI shows only the selected dealership at a time
    const settingsRef = collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings');
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      const settings: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        settings[doc.id] = doc.data();
      });
      setDealershipSettings(settings);
    }, (error) => {
      console.error("Dealership Settings Snapshot Error:", error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const saveAnnouncement = async (id: string, announcement: DealershipAnnouncement | null) => {
    await updateSetting(id, {
      announcement: announcement ?? deleteField(),
    });
  };

  const updateSetting = async (id: string, updates: any) => {
    try {
      const settingsRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings', id);
      await setDoc(settingsRef, {
        ...updates,
        id,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      const details = Object.entries(updates)
        .map(([k, v]) => `${k} set to ${v}`)
        .join(', ');
      
      if (currentUser) {
        await logSystemAction(
          "Update Settings",
          `Updated operational settings for ${DEALERSHIPS.find(d => d.id === id)?.name || id}: ${details}`,
          'settings',
          currentUser.email,
          currentUser.username,
          currentUser.dealershipId || id
        );
      }

      onSuccess?.(`Settings updated for ${DEALERSHIPS.find(d => d.id === id)?.name}`);
    } catch (err) {
      console.error("Error updating settings:", err);
      onError?.("Failed to update dealership settings. Access denied.");
    }
  };

  const [localCompetitionAdvisors, setLocalCompetitionAdvisors] = useState<
    Record<string, CompetitionAdvisorSlot[]>
  >({});

  useEffect(() => {
    if (Object.keys(dealershipSettings).length === 0) return;
    const next: Record<string, CompetitionAdvisorSlot[]> = {};
    Object.entries(dealershipSettings).forEach(([id, data]: [string, any]) => {
      next[id] = getDealershipStaffConfig(id, data).competitionAdvisors;
    });
    setLocalCompetitionAdvisors((prev) => ({ ...prev, ...next }));
  }, [dealershipSettings]);

  const commitCompetitionAdvisors = (id: string) => {
    const advisors = localCompetitionAdvisors[id];
    if (!advisors?.length) {
      onError?.('At least one competition advisor is required.');
      return;
    }
    updateSetting(id, { competitionAdvisors: advisors });
  };

  const updateCompetitionAdvisor = (
    dealershipId: string,
    index: number,
    field: 'id' | 'label',
    value: string
  ) => {
    setLocalCompetitionAdvisors((prev) => {
      const list = [...(prev[dealershipId] || [])];
      const current = { ...list[index] };
      if (field === 'label') {
        current.label = value;
        if (!current.id || current.id.startsWith('advisor_')) {
          current.id = slugifyStaffName(value) || current.id;
        }
      } else {
        current.id = slugifyStaffName(value) || value;
      }
      list[index] = current;
      return { ...prev, [dealershipId]: list };
    });
  };

  const addCompetitionAdvisor = (dealershipId: string) => {
    setLocalCompetitionAdvisors((prev) => {
      const list = [...(prev[dealershipId] || [])];
      const n = list.length + 1;
      list.push({ id: `advisor_${n}`, label: `Advisor ${n}` });
      return { ...prev, [dealershipId]: list };
    });
  };

  const removeCompetitionAdvisor = (dealershipId: string, index: number) => {
    setLocalCompetitionAdvisors((prev) => {
      const list = [...(prev[dealershipId] || [])];
      if (list.length <= 1) return prev;
      list.splice(index, 1);
      return { ...prev, [dealershipId]: list };
    });
  };


  const [localTechnicians, setLocalTechnicians] = useState<Record<string, CompetitionTechnicianSlot[]>>({});
  const [localPerformanceRoster, setLocalPerformanceRoster] = useState<Record<string, PerformanceAdvisorSlot[]>>({});
  const [localDispatchTechRoster, setLocalDispatchTechRoster] = useState<Record<string, PerformanceAdvisorSlot[]>>({});

  useEffect(() => {
    if (Object.keys(dealershipSettings).length === 0) return;
    const techNext: Record<string, CompetitionTechnicianSlot[]> = {};
    const perfNext: Record<string, PerformanceAdvisorSlot[]> = {};
    const dispatchTechNext: Record<string, PerformanceAdvisorSlot[]> = {};
    Object.entries(dealershipSettings).forEach(([id, data]: [string, any]) => {
      const cfg = getDealershipStaffConfig(id, data);
      techNext[id] = cfg.competitionTechnicians;
      perfNext[id] = cfg.performanceAdvisorRoster;
      const savedDispatchRoster = data.dispatchTechRoster;
      if (
        savedDispatchRoster?.length &&
        !isCrossDealershipDispatchRoster(savedDispatchRoster, id)
      ) {
        dispatchTechNext[id] = savedDispatchRoster;
      } else if (id === 'ford' || id === 'hyundai') {
        dispatchTechNext[id] = dispatchTechRosterForDealership(id);
      } else {
        dispatchTechNext[id] = cfg.competitionTechnicians.map((t, idx) => ({
          id: String(6400 + idx),
          label: t.label,
        }));
      }
    });
    setLocalTechnicians((prev) => ({ ...prev, ...techNext }));
    setLocalPerformanceRoster((prev) => ({ ...prev, ...perfNext }));
    setLocalDispatchTechRoster((prev) => ({ ...prev, ...dispatchTechNext }));
  }, [dealershipSettings]);

  const commitTechnicians = (id: string) => {
    const rows = localTechnicians[id];
    if (!rows?.length) {
      onError?.('At least one technician is required.');
      return;
    }
    updateSetting(id, { competitionTechnicians: rows });
  };

  const updateTechnician = (dealershipId: string, index: number, field: 'id' | 'label', value: string) => {
    setLocalTechnicians((prev) => {
      const list = [...(prev[dealershipId] || [])];
      const current = { ...list[index] };
      if (field === 'label') {
        current.label = value;
        current.id = slugifyStaffName(value) || current.id;
      } else {
        current.id = slugifyStaffName(value) || value;
      }
      list[index] = current;
      return { ...prev, [dealershipId]: list };
    });
  };

  const addTechnician = (dealershipId: string) => {
    setLocalTechnicians((prev) => {
      const list = [...(prev[dealershipId] || [])];
      const n = list.length + 1;
      list.push({ id: `tech_${n}`, label: `Tech ${n}` });
      return { ...prev, [dealershipId]: list };
    });
  };

  const removeTechnician = (dealershipId: string, index: number) => {
    setLocalTechnicians((prev) => {
      const list = [...(prev[dealershipId] || [])];
      if (list.length <= 1) return prev;
      list.splice(index, 1);
      return { ...prev, [dealershipId]: list };
    });
  };

  const commitPerformanceRoster = (id: string) => {
    const rows = localPerformanceRoster[id];
    if (!rows?.length) {
      onError?.('At least one performance advisor is required.');
      return;
    }
    updateSetting(id, { performanceAdvisorRoster: rows });
  };

  const updatePerformanceRoster = (dealershipId: string, index: number, field: 'id' | 'label', value: string) => {
    setLocalPerformanceRoster((prev) => {
      const list = [...(prev[dealershipId] || [])];
      const current = { ...list[index] };
      if (field === 'label') {
        current.label = value;
        current.id = slugifyStaffName(value) || current.id;
      } else {
        current.id = slugifyStaffName(value) || value;
      }
      list[index] = current;
      return { ...prev, [dealershipId]: list };
    });
  };

  const addPerformanceRoster = (dealershipId: string) => {
    setLocalPerformanceRoster((prev) => {
      const list = [...(prev[dealershipId] || [])];
      const n = list.length + 1;
      list.push({ id: `advisor_${n}`, label: `Advisor ${n}` });
      return { ...prev, [dealershipId]: list };
    });
  };

  const removePerformanceRoster = (dealershipId: string, index: number) => {
    setLocalPerformanceRoster((prev) => {
      const list = [...(prev[dealershipId] || [])];
      if (list.length <= 1) return prev;
      list.splice(index, 1);
      return { ...prev, [dealershipId]: list };
    });
  };

  const commitDispatchTechRoster = (id: string) => {
    const rows = localDispatchTechRoster[id] || [];
    updateSetting(id, { dispatchTechRoster: rows });
  };

  const updateDispatchTechRoster = (
    dealershipId: string,
    index: number,
    field: 'id' | 'label',
    value: string
  ) => {
    setLocalDispatchTechRoster((prev) => {
      const list = [...(prev[dealershipId] || [])];
      const current = { ...list[index] };
      if (field === 'label') {
        current.label = value;
      } else {
        current.id = value.trim();
      }
      list[index] = current;
      return { ...prev, [dealershipId]: list };
    });
  };

  const addDispatchTechRoster = (dealershipId: string) => {
    setLocalDispatchTechRoster((prev) => {
      const list = [...(prev[dealershipId] || [])];
      list.push({ id: '', label: '' });
      return { ...prev, [dealershipId]: list };
    });
  };

  const removeDispatchTechRoster = (dealershipId: string, index: number) => {
    setLocalDispatchTechRoster((prev) => {
      const list = [...(prev[dealershipId] || [])];
      list.splice(index, 1);
      return { ...prev, [dealershipId]: list };
    });
  };


  useEffect(() => {
    if (!currentUser) return;

    const scopeTenantId = tenantIdFromDealershipId(
      currentDealershipId || resolveUserTenantId(currentUser)
    );

    const usersRef = collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users');
    const scopedDealershipId = getTenantProfile(scopeTenantId)?.dealershipId;

    const q = scopedDealershipId
      ? query(usersRef, where('tenantId', '==', scopeTenantId))
      : query(usersRef, where('tenantId', '==', scopeTenantId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const usersData = snapshot.docs
          .map((docSnap) => normalizeUserProfile({ uid: docSnap.id, ...docSnap.data() }))
          .filter((u) => userBelongsToTenant(u, scopeTenantId));
        setUsers(usersData);
        setLoading(false);
      },
      async (error) => {
        console.error('AdminPanel Snapshot Error:', error);
        if (!scopedDealershipId) {
          setLoading(false);
          return;
        }
        try {
          const legacyQuery = query(usersRef, where('dealershipId', '==', scopedDealershipId));
          const legacySnap = await getDocs(legacyQuery);
          const usersData = legacySnap.docs
            .map((docSnap) => normalizeUserProfile({ uid: docSnap.id, ...docSnap.data() }))
            .filter((u) => userBelongsToTenant(u, scopeTenantId));
          setUsers(usersData);
        } catch (legacyError) {
          console.error('AdminPanel legacy user query failed:', legacyError);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, currentDealershipId]);

  const [confirmDeleteUid, setConfirmDeleteId] = useState<string | null>(null);

  const updateUserStatus = async (uid: string, status: UserStatus, userToUpdate?: User) => {
    try {
      if (!currentUser) return;
      
      // Managers cannot approve other managers
      if (!isPlatformAdmin(currentUser) && (userToUpdate?.isManager || userToUpdate?.role === 'manager')) {
        onError?.("Permission denied. Only system admins can approve manager accounts.");
        return;
      }

      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await updateDoc(userRef, buildUserApprovalPatch(userToUpdate || { role: 'pending', status: 'pending' }, status));

      await logSystemAction(
        "User Status Approved/Rejected",
        `Set status of user ${userToUpdate?.username || uid} (${userToUpdate?.email || ''}) to ${status}`,
        'settings',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );
    } catch (error) {
      onError?.("Permission denied. Ensure you have proper authority level.");
      console.error("Error updating user status:", error);
    }
  };


  const rejectPendingUser = async (userToUpdate: User) => {
    try {
      if (!currentUser) return;
      if (isProtectedUser(userToUpdate)) {
        onError?.('This account is protected and cannot be modified.');
        return;
      }
      if (panelMode === 'admin' && !isPendingManagerEnrollment(userToUpdate)) {
        onError?.('Only pending manager enrollments can be revoked here.');
        return;
      }
      if (panelMode === 'manager' && !isPendingStaffEnrollment(userToUpdate)) {
        onError?.('Only pending sales and service enrollments can be revoked here.');
        return;
      }
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', userToUpdate.uid);
      await deleteDoc(userRef);
      await logSystemAction(
        'Enrollment Revoked',
        `Removed pending enrollment for ${userToUpdate.username} (${userToUpdate.email})`,
        'settings',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId || userToUpdate.dealershipId
      );
      onSuccess?.(`${userToUpdate.username} removed from pending enrollments.`);
    } catch (error) {
      onError?.('Failed to revoke enrollment.');
      console.error('Error revoking pending user:', error);
    }
  };

  const updateManagerAdminPermission = async (
    uid: string,
    permission: ManagerAdminPermission,
    userToUpdate?: User
  ) => {
    try {
      if (!currentUser) return;

      if (!isPlatformAdmin(currentUser) && (userToUpdate?.isManager || userToUpdate?.role === 'manager')) {
        onError?.("Managers cannot modify other managers.");
        return;
      }

      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await updateDoc(userRef, buildManagerAdminRolePatch(permission));

      await logSystemAction(
        "User Role Updated",
        `Updated permission of user ${userToUpdate?.username || uid} to ${permission}`,
        'settings',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );
    } catch (error) {
      onError?.("Permission denied. Insufficient administrative level.");
      console.error("Error updating manager permission:", error);
    }
  };


  const updateStaffRole = async (uid: string, role: Role, userToUpdate?: User) => {
    try {
      if (!currentUser) return;

      if (!isPlatformAdmin(currentUser) && (userToUpdate?.isManager || userToUpdate?.role === 'manager')) {
        onError?.("Managers cannot modify other managers.");
        return;
      }

      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      const isSales = role === 'Salesperson';
      await updateDoc(userRef, {
        role: 'advisor',
        department: isSales ? 'sales' : 'service',
        isManager: false,
      });

      await logSystemAction(
        "User Role Updated",
        `Updated role of user ${userToUpdate?.username || uid} to ${role}`,
        'settings',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );
    } catch (error) {
      onError?.("Permission denied. Insufficient administrative level.");
      console.error("Error updating user role:", error);
    }
  };

  const deleteUser = async (uid: string, userToUpdate?: User) => {
    try {
      if (!currentUser) return;

      const target = userToUpdate || users.find((u) => u.uid === uid);
      if (target && (isProtectedUser(target) || !canModifyUser(currentUser, target))) {
        onError?.('This user cannot be removed.');
        setConfirmDeleteId(null);
        return;
      }
      
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await deleteDoc(userRef);
      setConfirmDeleteId(null);

      await logSystemAction(
        "User Deleted",
        `Deleted user registration with ID: ${uid}`,
        'settings',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );

      onSuccess?.("User record permanently removed.");
    } catch (error) {
      onError?.("Permission denied. You must be an authorized admin to delete users.");
      console.error("Error deleting user:", error);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.jobTitle?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingUsers = filteredUsers.filter((u) => {
    if (!isPendingUser(u) || u.status === 'rejected') return false;
    if (panelMode === 'admin') return isPendingManagerEnrollment(u);
    if (panelMode === 'manager') return isPendingStaffEnrollment(u);
    return true;
  });
  const activeUsers = filteredUsers.filter((u) => {
    if (isPendingUser(u) || u.status === 'rejected') return false;
    if (panelMode === 'admin') return u.role === 'manager' || u.role === 'Manager' || u.isManager === true;
    if (panelMode === 'manager') return u.role !== 'manager' && u.role !== 'Manager' && u.role !== 'admin' && u.isManager !== true;
    return true;
  });

  const resolvedSubTab = activeSubTab || (panelMode === 'admin' ? 'logs' : 'operations');
  let subTab =
    panelMode === 'admin' && resolvedSubTab === 'operations' ? 'logs' : resolvedSubTab;
  if (panelMode === 'admin' && subTab === 'users') subTab = 'master-users';
  if (panelMode === 'admin' && subTab === 'enrollments') subTab = 'logs';
  const sectionMeta = getPanelSectionMeta(subTab, panelMode);

  return (
    <div className="space-y-8 animate-fade-in pb-20 max-w-4xl mx-auto w-full">
      <PageHeader
        title={sectionMeta.title}
        description={sectionMeta.description}
        breadcrumbs={[{ label: sectionMeta.eyebrow }]}
      />

      {panelMode === 'full' && (
        <div className="bg-slate-950/35 p-1.5 rounded-[22px] border border-white/5 backdrop-blur-md shadow-2xl relative overflow-hidden ring-1 ring-black/30">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {([
              { id: 'operations', label: 'Operations', icon: Target, desc: 'Store Configuration' },
              { id: 'users', label: 'User Settings', icon: Users, desc: 'Identity & Access' },
              { id: 'logs', label: 'Logs', icon: FileText, desc: 'System Audit Logs' },
              { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal, desc: 'Your Workspace' }
            ] as const).map(tab => {
              const Icon = tab.icon;
              const isSelected = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onChangeSubTab?.(tab.id as any)}
                  className={cn(
                    "flex flex-col items-start gap-1 px-4 py-3 rounded-[16px] transition-all duration-300 border text-left select-none relative group w-full",
                    isSelected
                      ? "bg-brand-primary text-slate-950 border-brand-primary shadow-lg shadow-brand-primary/10 font-bold"
                      : "bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={13} className={isSelected ? "text-slate-950" : "text-brand-primary group-hover:scale-110 transition-transform"} />
                    <span className="text-[10px] font-black uppercase tracking-wider">{tab.label}</span>
                  </div>
                  <span className={cn(
                    "text-[8px] font-bold uppercase tracking-widest leading-none mt-1",
                    isSelected ? "text-slate-950/70" : "text-slate-500 group-hover:text-slate-400"
                  )}>
                    {tab.desc}
                  </span>
                  {isSelected && (
                    <span className="absolute bottom-1 right-2 w-1.5 h-1.5 rounded-full bg-slate-950"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-tab Content Panels */}

      {panelMode === 'admin' && subTab === 'master-users' && (
        <div className="space-y-4 mb-8 animate-in fade-in duration-300">
          <PageHeader
            title="Dealership announcements"
            description="Publish a live banner for logged-in staff at each store. Updates appear instantly for all users."
          />
          <div className="grid grid-cols-1 gap-4">
            {DEALERSHIPS.map((d) => (
              <DealershipAnnouncementSettings
                key={`announcement-${d.id}`}
                dealershipId={d.id}
                dealershipName={d.name}
                announcement={dealershipSettings[d.id]?.announcement}
                currentUserEmail={currentUser?.email}
                onSave={(announcement) => saveAnnouncement(d.id, announcement)}
              />
            ))}
          </div>
        </div>
      )}

      {subTab === 'operations' && panelMode !== 'admin' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {DEALERSHIPS.filter((d) => d.id === currentDealershipId).map((d) => {
              // Operation settings are scoped to the selected dealership only
              if (currentUser?.role !== 'admin' && currentUser?.dealershipId !== d.id) return null;

              return (
                <div key={d.id} className={cn(
                  "card-base rounded-3xl border border-white/5 overflow-hidden p-6 col-span-full"
                )}>
                  <div className="flex flex-col gap-6">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{d.name}</span>

                    <div className="space-y-8">
                        <DealershipAnnouncementSettings
                          dealershipId={d.id}
                          dealershipName={d.name}
                          announcement={dealershipSettings[d.id]?.announcement}
                          currentUserEmail={currentUser?.email}
                          onSave={(announcement) => saveAnnouncement(d.id, announcement)}
                        />

                        <ManagerOperationsConfig
                          dealershipId={d.id}
                          dealershipName={d.name}
                          settings={dealershipSettings[d.id] ?? {}}
                          onUpdate={(patch) => updateSetting(d.id, patch)}
                        />

                        <StoreWorkspaceDefaultsSettings
                          defaults={dealershipSettings[d.id]?.storeWorkspaceDefaults ?? {}}
                          onChange={(patch) => updateSetting(d.id, patch)}
                        />

                        <ManagerPermissionsMatrix />

                        {/* DMS Configuration */}
                        <div className="space-y-3">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                            <Database size={12} className="text-brand-primary" />
                            DMS Configuration
                          </label>
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed max-w-xl">
                            Choose your dealership management system. Report PDF imports (appointments, advisor performance, technician productivity) will route to the matching layout parser.
                          </p>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 max-w-lg">
                            <select
                              value={normalizeDmsProvider(dealershipSettings[d.id]?.dmsProvider) || defaultDmsProviderForDealership(d.id)}
                              onChange={(e) =>
                                updateSetting(
                                  d.id,
                                  buildDmsProviderSettingsPatch(
                                    d.id,
                                    e.target.value as DmsProviderId,
                                    dealershipSettings[d.id]
                                  )
                                )
                              }
                              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 cursor-pointer"
                            >
                              {DMS_PROVIDERS.map((provider) => (
                                <option key={provider.id} value={provider.id} className="bg-slate-950">
                                  {provider.label}
                                </option>
                              ))}
                            </select>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 shrink-0">
                              Active parser
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-600 leading-relaxed max-w-xl">
                            {DMS_PROVIDERS.find((provider) => provider.id === (normalizeDmsProvider(dealershipSettings[d.id]?.dmsProvider) || defaultDmsProviderForDealership(d.id)))?.description}
                          </p>
                        </div>

                        {/* Pot of Gold competition roster */}
                        <div className="space-y-3 pt-3 border-t border-white/5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                            <Trophy size={12} className="text-brand-primary" />
                            Pot of Gold Competition Advisors
                          </label>
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed max-w-xl">
                            Configure the advisor columns used in the Pot of Gold competition tracker and PDF imports for this store.
                          </p>
                          <div className="space-y-2 max-w-lg">
                            {(localCompetitionAdvisors[d.id] || getDealershipStaffConfig(d.id, dealershipSettings[d.id]).competitionAdvisors).map((advisor, idx) => (
                              <div key={`${advisor.id}-${idx}`} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                                <input
                                  type="text"
                                  value={advisor.label}
                                  onChange={(e) => updateCompetitionAdvisor(d.id, idx, 'label', e.target.value)}
                                  placeholder="Display name"
                                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                                />
                                <input
                                  type="text"
                                  value={advisor.id}
                                  onChange={(e) => updateCompetitionAdvisor(d.id, idx, 'id', e.target.value)}
                                  placeholder="Column key"
                                  className="w-full sm:w-36 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeCompetitionAdvisor(d.id, idx)}
                                  className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => addCompetitionAdvisor(d.id)}
                              className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-[10px] font-black uppercase tracking-widest text-white rounded-xl border border-slate-700"
                            >
                              Add Advisor
                            </button>
                            <button
                              type="button"
                              onClick={() => commitCompetitionAdvisors(d.id)}
                              className="px-4 py-2 bg-brand-primary/20 hover:bg-brand-primary/30 text-[10px] font-black uppercase tracking-widest text-brand-primary rounded-xl border border-brand-primary/30"
                            >
                              Save Roster
                            </button>
                          </div>
                        </div>

                        {(dealershipSettings[d.id]?.performanceAdvisorRoster?.length ?? 0) > 0 && (
                          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                              Productivity advisors
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {(dealershipSettings[d.id]?.performanceAdvisorRoster || []).map(
                                (slot: { id: string; label: string }) => (
                                  <span
                                    key={slot.id}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-950/50 text-indigo-300 border border-indigo-900/40"
                                  >
                                    {slot.label}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {/* Dispatch Toggle Feature Switch */}
                        <div className="space-y-3 pt-3 border-t border-white/5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic block">Feature Switches</label>
                          <div className="flex items-center justify-between p-3.5 bg-slate-950/80 rounded-xl border border-white/5 shadow-inner">
                            <div className="space-y-0.5 pr-2">
                              <span className="text-xs font-black text-white uppercase tracking-wide block">Departmental Dispatch Board</span>
                              <span className="text-[10px] text-slate-400 font-medium leading-normal block">Show or hide the Dispatch tab in the header navigation menu.</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const currentVal = dealershipSettings[d.id]?.enableDispatchTab !== false;
                                updateSetting(d.id, { enableDispatchTab: !currentVal });
                              }}
                              className={cn(
                                "w-11 h-6 rounded-full transition-colors relative focus:outline-none shrink-0",
                                (dealershipSettings[d.id]?.enableDispatchTab !== false) ? "bg-brand-primary" : "bg-slate-800"
                              )}
                            >
                              <span 
                                className={cn(
                                  "absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-all shadow-md",
                                  (dealershipSettings[d.id]?.enableDispatchTab !== false) ? "translate-x-5" : "translate-x-0"
                                )}
                              />
                            </button>
                          </div>

                          {/* Dispatch lane capacity */}
                          <div className="space-y-3 pt-3 border-t border-white/5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic block">Dispatch Lane Capacity</label>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                              Soft caps per production lane. Set to 0 for unlimited. Optionally block new routing when a lane is full.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {DISPATCH_PRODUCTION_LANES.map((lane) => {
                                const caps = mergeLaneCapacity(dealershipSettings[d.id]?.dispatchLaneCapacity);
                                const value = caps[lane.id];
                                return (
                                  <div key={lane.id} className="flex items-center justify-between gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-white/5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate">{lane.label}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={99}
                                      value={value}
                                      onChange={(e) => {
                                        const n = Math.max(0, parseInt(e.target.value, 10) || 0);
                                        const prev = dealershipSettings[d.id]?.dispatchLaneCapacity || {};
                                        updateSetting(d.id, {
                                          dispatchLaneCapacity: { ...prev, [lane.id]: n },
                                        });
                                      }}
                                      className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs font-black text-white text-center focus:outline-none focus:ring-1 focus:ring-brand-primary"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex flex-col gap-2 pt-1">
                              <label className="flex items-center justify-between p-3 bg-slate-950/80 rounded-xl border border-white/5 cursor-pointer">
                                <div>
                                  <span className="text-xs font-black text-white uppercase tracking-wide block">Show today&apos;s shop load</span>
                                  <span className="text-[10px] text-slate-500">Compare active dispatch ROs to daily appointment goal.</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const on = dealershipSettings[d.id]?.dispatchShowTodayLoad !== false;
                                    updateSetting(d.id, { dispatchShowTodayLoad: !on });
                                  }}
                                  className={cn(
                                    'w-11 h-6 rounded-full transition-colors relative shrink-0',
                                    dealershipSettings[d.id]?.dispatchShowTodayLoad !== false ? 'bg-brand-primary' : 'bg-slate-800'
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-all shadow-md',
                                      dealershipSettings[d.id]?.dispatchShowTodayLoad !== false ? 'translate-x-5' : 'translate-x-0'
                                    )}
                                  />
                                </button>
                              </label>
                              <label className="flex items-center justify-between p-3 bg-slate-950/80 rounded-xl border border-white/5 cursor-pointer">
                                <div>
                                  <span className="text-xs font-black text-white uppercase tracking-wide block">Block routing when lane full</span>
                                  <span className="text-[10px] text-slate-500">Prevent dropping ROs into lanes at capacity.</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const on = !!dealershipSettings[d.id]?.dispatchBlockWhenFull;
                                    updateSetting(d.id, { dispatchBlockWhenFull: !on });
                                  }}
                                  className={cn(
                                    'w-11 h-6 rounded-full transition-colors relative shrink-0',
                                    dealershipSettings[d.id]?.dispatchBlockWhenFull ? 'bg-brand-primary' : 'bg-slate-800'
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-all shadow-md',
                                      dealershipSettings[d.id]?.dispatchBlockWhenFull ? 'translate-x-5' : 'translate-x-0'
                                    )}
                                  />
                                </button>
                              </label>
                            </div>
                            <div className="space-y-2 pt-2 border-t border-white/5">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic block">
                                Dispatch tech roster
                              </label>
                              <p className="text-[10px] text-slate-500 leading-relaxed">
                                Map DMS tech numbers to display names on dispatch cards. ID = tech number, Label = name.
                              </p>
                              <div className="space-y-2">
                                {(localDispatchTechRoster[d.id] || []).map((row, idx) => (
                                  <div key={`dispatch-tech-${idx}`} className="flex gap-2 items-center">
                                    <input
                                      type="text"
                                      placeholder="Tech #"
                                      value={row.id}
                                      onChange={(e) => updateDispatchTechRoster(d.id, idx, 'id', e.target.value)}
                                      className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs font-mono text-white"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Display name"
                                      value={row.label}
                                      onChange={(e) => updateDispatchTechRoster(d.id, idx, 'label', e.target.value)}
                                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs font-bold text-white"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeDispatchTechRoster(d.id, idx)}
                                      className="text-[9px] font-black uppercase text-rose-400 px-2"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => addDispatchTechRoster(d.id)}
                                  className="px-3 py-1.5 bg-slate-800 text-[9px] font-black uppercase tracking-widest text-white rounded-lg border border-slate-700"
                                >
                                  Add Tech
                                </button>
                                <button
                                  type="button"
                                  onClick={() => commitDispatchTechRoster(d.id)}
                                  className="px-3 py-1.5 bg-brand-primary/20 text-[9px] font-black uppercase tracking-widest text-brand-primary rounded-lg border border-brand-primary/30"
                                >
                                  Save Tech Roster
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'master-users' && panelMode === 'admin' && (
        <MasterUserSettings onSuccess={onSuccess} onError={onError} />
      )}

      {/* SYSTEM TRAILS / LOGS */}
      {subTab === 'preferences' && (
        <SettingsPage
          embedded
          onNavigate={(tab) => onNavigateTab?.(tab)}
          onNotify={(msg, isError) => (isError ? onError?.(msg) : onSuccess?.(msg))}
          currentDealershipId={currentDealershipId}
          onDealershipChange={onDealershipChange}
        />
      )}

      {subTab === 'ai-usage' && panelMode === 'admin' && (
        <AiUsageLogsPanel />
      )}

      {subTab === 'suggestions' && panelMode === 'admin' && (
        <SuggestionsPanel />
      )}

      {subTab === 'import-health' && panelMode === 'admin' && (
        <DmsImportHealthPanel dealershipSettings={dealershipSettings} />
      )}

      {subTab === 'pbs-sync' && panelMode === 'admin' && (
        <PbsSyncPanel
          dealershipId="hyundai"
          dealershipName={
            DEALERSHIPS.find((d) => d.id === 'hyundai')?.name || PBS_SYNC_DEALERSHIP_NAME
          }
          settings={dealershipSettings.hyundai}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}

      {subTab === 'logs' && (
        <div className="animate-in fade-in duration-300 space-y-2">
          <SystemLogs
            dealershipId={currentDealershipId}
            tenantScope={panelMode === 'manager'}
          />
          {panelMode === 'admin' ? (
            <PbsSyncLogsPanel
              dealershipId={currentDealershipId || 'hyundai'}
              settings={dealershipSettings.hyundai}
            />
          ) : null}
        </div>
      )}

    </div>
  );
}
