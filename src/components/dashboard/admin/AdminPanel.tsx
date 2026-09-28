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
import { SettingsDetail, SettingsGate, SettingsMenu, SettingsOnly, type SettingsMenuGroup } from '../../ui/SettingsMenu';
import { resolveServiceAlertMode } from '../../../lib/dealershipSettingsUtils';
import { DEFAULT_PROMISE_HOURS_FROM_NOW } from '../../../lib/operationsConfig';
import {
  Activity as OpsActivity,
  AlertTriangle as OpsAlert,
  Bell as OpsBell,
  Clock as OpsClock,
  Columns3 as OpsColumns,
  Database as OpsDatabase,
  Gauge as OpsGauge,
  ListChecks as OpsList,
  Megaphone as OpsMegaphone,
  Monitor as OpsMonitor,
  Moon as OpsMoon,
  Shield as OpsShield,
  Target as OpsTarget,
  TrendingUp as OpsTrending,
  Trophy as OpsTrophy,
  UserCog as OpsUserCog,
  Users as OpsUsers,
  Wrench as OpsWrench,
} from 'lucide-react';
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
    panelMode === 'admin' ? 'Admin' : panelMode === 'manager' ? 'Manager' : 'Administration';

  switch (subTab) {
    case 'operations':
      return {
        eyebrow: scope,
        title: 'Operation settings',
        description: 'Dispatch, service alerts, goals and imports for this store.',
      };
    case 'preferences':
      return {
        eyebrow: scope,
        title: 'Preferences',
        description: 'Your own display and contact-workflow settings.',
      };
    case 'users':
      return {
        eyebrow: scope,
        title: 'Team',
        description:
          panelMode === 'manager'
            ? 'Approve new staff and manage what each person can see.'
            : 'Store staff are managed under Manager → Team.',
      };
    case 'ai-usage':
      return {
        eyebrow: scope,
        title: 'AI usage',
        description: 'Usage from PDF and DMS report imports.',
      };
    case 'suggestions':
      return {
        eyebrow: scope,
        title: 'Suggestions',
        description: 'Feedback sent from the suggestion button.',
      };
    case 'master-users':
      return {
        eyebrow: scope,
        title: 'Master users',
        description: 'Every account across all three stores, and store announcements.',
      };
    case 'enrollments':
      return {
        eyebrow: scope,
        title: 'Access requests',
        description: 'Manager requests are approved under Manager → Team.',
      };
    case 'import-health':
      return {
        eyebrow: scope,
        title: 'Import health',
        description: 'Last successful PDF import and recent failures for each store.',
      };
    case 'pbs-sync':
      return {
        eyebrow: scope,
        title: 'PBS sync',
        description: 'Customer and vehicle changes from PBS PartnerHUB, matched by VIN. Runs every morning at 6:00 AM Pacific.',
      };
    case 'logs':
      return {
        eyebrow: scope,
        title: panelMode === 'manager' ? 'Logs' : 'Audit logs',
        description:
          panelMode === 'manager'
            ? 'Activity at this store, with who did it and when. Entries cannot be edited.'
            : 'Activity across all stores, plus PBS sync history. Entries cannot be edited.',
      };
    default:
      return {
        eyebrow: scope,
        title: 'Administration',
        description: 'Settings for this store.',
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
      // Firestore rejects undefined. Clearing a value means dropping the key, not
      // writing undefined into it.
      const stripUndefined = (value: any): any => {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
        return Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, stripUndefined(v)])
        );
      };
      const cleanUpdates = stripUndefined(updates);
      await setDoc(settingsRef, {
        ...cleanUpdates,
        id,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      const details = Object.entries(cleanUpdates)
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

  // Which Operation settings screen is open; null shows the menu.
  const [opsSection, setOpsSection] = useState<string | null>(null);
  useEffect(() => {
    setOpsSection(null);
  }, [activeSubTab, currentDealershipId]);
  useEffect(() => {
    if (opsSection) window.scrollTo({ top: 0 });
  }, [opsSection]);

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
  const opsDetailOpen = subTab === 'operations' && opsSection !== null;

  return (
    <div className="space-y-8 animate-fade-in pb-20 max-w-4xl mx-auto w-full">
      {/* A single setting's screen carries its own back link and title. */}
      {!opsDetailOpen ? (
        <PageHeader
          title={sectionMeta.title}
          description={sectionMeta.description}
          breadcrumbs={[{ label: sectionMeta.eyebrow }]}
        />
      ) : null}

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
                    <span className="text-xs font-semibold ">{tab.label}</span>
                  </div>
                  <span className={cn(
                    "text-xs font-bold leading-none mt-1",
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
            description="A banner shown to signed-in staff at each store."
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

      {subTab === 'operations' && panelMode !== 'admin' && (() => {
        // Operation settings as a menu. Each row opens one setting on its own screen;
        // the blocks below are the same controls as before, gated by id.
        const d = DEALERSHIPS.find((x) => x.id === currentDealershipId);
        if (!d) return null;
        if (currentUser?.role !== 'admin' && currentUser?.dealershipId !== d.id) return null;
        const s = dealershipSettings[d.id] ?? {};
        const dms = normalizeDmsProvider(s.dmsProvider) || defaultDmsProviderForDealership(d.id);
        const alertMode = resolveServiceAlertMode(s);
        const promiseHrs = s.dispatchPromiseDefaults?.defaultHoursFromNow ?? DEFAULT_PROMISE_HOURS_FROM_NOW;
        const sweepMode = s.dispatchMidnightSweep?.mode ?? 'auto';
        const roster = localCompetitionAdvisors[d.id] || getDealershipStaffConfig(d.id, s).competitionAdvisors;
        const dispatchOn = s.enableDispatchTab !== false;

        const groups: SettingsMenuGroup[] = [
          {
            label: 'Store',
            items: [
              { id: 'announcement', title: 'Announcement', icon: OpsMegaphone, tone: 'amber', value: s.announcement?.enabled ? 'On' : 'Off' },
              { id: 'goals', title: 'Monthly goals', icon: OpsTarget, tone: 'blue', value: `${s.appointmentTarget ?? 20} appts/day` },
              { id: 'dms', title: 'DMS', icon: OpsDatabase, tone: 'blue', value: DMS_PROVIDERS.find((p) => p.id === dms)?.label ?? dms },
              { id: 'workspace', title: 'New staff defaults', icon: OpsUserCog, tone: 'blue' },
              { id: 'permissions', title: 'Manager permissions', icon: OpsShield, tone: 'blue' },
            ],
          },
          {
            label: 'Service',
            items: [
              { id: 'alerts', title: 'Service alerts', icon: OpsBell, tone: 'violet', value: alertMode === 'smart' ? 'Smart' : alertMode === 'optimized' ? 'Per customer' : 'Standard' },
              { id: 'advisors', title: 'Advisor roster', icon: OpsUsers, tone: 'violet', hidden: dms !== 'pbs', value: `${s.performanceAdvisorRoster?.length ?? 0}` },
              { id: 'potofgold', title: 'Pot of Gold advisors', icon: OpsTrophy, tone: 'violet', value: `${roster.length}` },
              { id: 'forecast', title: 'Forecast defaults', icon: OpsTrending, tone: 'violet' },
            ],
          },
          {
            label: 'Dispatch',
            items: [
              { id: 'board', title: 'Dispatch board', icon: OpsColumns, tone: 'teal', value: dispatchOn ? 'On' : 'Off' },
              { id: 'lanes', title: 'Lane names and order', icon: OpsColumns, tone: 'teal', hidden: !dispatchOn },
              { id: 'capacity', title: 'Lane capacity', icon: OpsGauge, tone: 'teal', hidden: !dispatchOn },
              { id: 'techs', title: 'Technicians', icon: OpsWrench, tone: 'teal', hidden: !dispatchOn, value: `${(localDispatchTechRoster[d.id] || []).length}` },
              { id: 'promise', title: 'Promise times', icon: OpsClock, tone: 'teal', hidden: !dispatchOn, value: promiseHrs ? `${promiseHrs} hrs` : 'None' },
              { id: 'overdue', title: 'Overdue alerts', icon: OpsAlert, tone: 'teal', hidden: !dispatchOn },
              { id: 'intake', title: 'Required intake fields', icon: OpsList, tone: 'teal', hidden: !dispatchOn },
              { id: 'techdisplay', title: 'Shop TV display', icon: OpsMonitor, tone: 'teal', hidden: !dispatchOn, value: s.dispatchTechDisplayConfig?.autoOpenOnTv ? 'Auto-open' : 'Manual' },
              { id: 'sweep', title: 'End of day', icon: OpsMoon, tone: 'teal', hidden: !dispatchOn, value: sweepMode === 'auto' ? 'Automatic' : sweepMode === 'confirm' ? 'Ask first' : 'Off' },
              { id: 'activity', title: 'Activity summary', icon: OpsActivity, tone: 'teal', hidden: !dispatchOn },
            ],
          },
        ];
        const open = groups.flatMap((g) => g.items).find((i) => i.id === opsSection);

        if (!open) return <SettingsMenu groups={groups} onOpen={setOpsSection} />;

        const toggle = (on: boolean, onClick: () => void, label: string) => (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={onClick}
            className={cn('w-11 h-6 rounded-full transition-colors relative shrink-0', on ? 'bg-brand-primary' : 'bg-slate-300')}
            style={on ? undefined : { backgroundColor: 'var(--color-input-border)' }}
          >
            <span
              className={cn('absolute top-1 left-1 w-4 h-4 rounded-full transition-all shadow', on ? 'translate-x-5' : 'translate-x-0')}
              style={{ backgroundColor: '#fff' }}
            />
          </button>
        );
        const switchRow = (title: string, hint: string, on: boolean, onClick: () => void) => (
          <div className="flex items-center justify-between gap-4 py-1">
            <div className="min-w-0">
              <p className="text-sm font-medium">{title}</p>
              <p className="crm-label mt-0.5">{hint}</p>
            </div>
            {toggle(on, onClick, title)}
          </div>
        );

        return (
          <SettingsDetail
            backLabel="Operation settings"
            title={open.title}
            description={d.name}
            onBack={() => setOpsSection(null)}
          >
            <SettingsOnly id={open.id}>
              <SettingsGate id="announcement">
                <DealershipAnnouncementSettings
                  dealershipId={d.id}
                  dealershipName={d.name}
                  announcement={s.announcement}
                  currentUserEmail={currentUser?.email}
                  onSave={(announcement) => saveAnnouncement(d.id, announcement)}
                />
              </SettingsGate>

              <ManagerOperationsConfig
                dealershipId={d.id}
                dealershipName={d.name}
                settings={s}
                onUpdate={(patch) => updateSetting(d.id, patch)}
              />

              <SettingsGate id="workspace">
                <StoreWorkspaceDefaultsSettings
                  defaults={s.storeWorkspaceDefaults ?? {}}
                  onChange={(patch) => updateSetting(d.id, patch)}
                />
              </SettingsGate>

              <SettingsGate id="permissions">
                <ManagerPermissionsMatrix />
              </SettingsGate>

              <SettingsGate id="dms">
                <p className="crm-label">
                  Report PDF imports (appointments, advisor performance, technician productivity) use the
                  layout for this system.
                </p>
                <label className="input-label" htmlFor="ops-dms">Dealership management system</label>
                <select
                  id="ops-dms"
                  value={dms}
                  onChange={(e) =>
                    updateSetting(d.id, buildDmsProviderSettingsPatch(d.id, e.target.value as DmsProviderId, s))
                  }
                  className="input-field"
                >
                  {DMS_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.label}</option>
                  ))}
                </select>
                <p className="crm-label">{DMS_PROVIDERS.find((p) => p.id === dms)?.description}</p>
              </SettingsGate>

              <SettingsGate id="potofgold">
                <p className="crm-label">The advisor columns in the Pot of Gold tracker and its PDF imports.</p>
                <div className="list-group">
                  {roster.map((advisor, idx) => (
                    <div key={`${advisor.id}-${idx}`} className="list-row flex-wrap sm:flex-nowrap">
                      <input
                        type="text"
                        value={advisor.label}
                        onChange={(e) => updateCompetitionAdvisor(d.id, idx, 'label', e.target.value)}
                        placeholder="Name"
                        aria-label="Advisor name"
                        className="input-field flex-1 min-w-0"
                      />
                      <input
                        type="text"
                        value={advisor.id}
                        onChange={(e) => updateCompetitionAdvisor(d.id, idx, 'id', e.target.value)}
                        placeholder="Report column"
                        aria-label="Report column"
                        className="input-field sm:w-36 font-mono"
                      />
                      <button type="button" onClick={() => removeCompetitionAdvisor(d.id, idx)} className="text-sm font-semibold text-rose-500 px-2 min-h-[44px]">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => addCompetitionAdvisor(d.id)} className="btn-secondary">Add advisor</button>
                  <button type="button" onClick={() => commitCompetitionAdvisors(d.id)} className="btn-primary">Save</button>
                </div>
              </SettingsGate>

              <SettingsGate id="board">
                {switchRow('Show the Dispatch board', 'Adds Dispatch to the Service menu for this store.', dispatchOn, () =>
                  updateSetting(d.id, { enableDispatchTab: !dispatchOn })
                )}
                {dispatchOn
                  ? switchRow(
                      "Show today's shop load",
                      'Compares active repair orders to the daily appointment goal.',
                      s.dispatchShowTodayLoad !== false,
                      () => updateSetting(d.id, { dispatchShowTodayLoad: !(s.dispatchShowTodayLoad !== false) })
                    )
                  : null}
              </SettingsGate>

              <SettingsGate id="capacity">
                <p className="crm-label">A soft limit per lane. 0 means no limit.</p>
                <div className="list-group">
                  {DISPATCH_PRODUCTION_LANES.map((lane) => {
                    const caps = mergeLaneCapacity(s.dispatchLaneCapacity);
                    return (
                      <div key={lane.id} className="list-row">
                        <span className="flex-1 text-sm">{lane.label}</span>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          inputMode="numeric"
                          aria-label={`${lane.label} capacity`}
                          value={caps[lane.id]}
                          onChange={(e) => {
                            const n = Math.max(0, parseInt(e.target.value, 10) || 0);
                            updateSetting(d.id, { dispatchLaneCapacity: { ...(s.dispatchLaneCapacity || {}), [lane.id]: n } });
                          }}
                          className="input-field w-20 text-center"
                        />
                      </div>
                    );
                  })}
                </div>
                {switchRow('Block routing when a lane is full', 'Stops new repair orders going into a lane at its limit.', !!s.dispatchBlockWhenFull, () =>
                  updateSetting(d.id, { dispatchBlockWhenFull: !s.dispatchBlockWhenFull })
                )}
              </SettingsGate>

              <SettingsGate id="techs">
                <p className="crm-label">Names shown on dispatch cards for each technician number.</p>
                <div className="list-group">
                  {(localDispatchTechRoster[d.id] || []).map((row, idx) => (
                    <div key={`dispatch-tech-${idx}`} className="list-row">
                      <input
                        type="text"
                        placeholder="Tech #"
                        aria-label="Technician number"
                        value={row.id}
                        onChange={(e) => updateDispatchTechRoster(d.id, idx, 'id', e.target.value)}
                        className="input-field w-24 font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Name"
                        aria-label="Technician name"
                        value={row.label}
                        onChange={(e) => updateDispatchTechRoster(d.id, idx, 'label', e.target.value)}
                        className="input-field flex-1 min-w-0"
                      />
                      <button type="button" onClick={() => removeDispatchTechRoster(d.id, idx)} className="text-sm font-semibold text-rose-500 px-2 min-h-[44px]">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => addDispatchTechRoster(d.id)} className="btn-secondary">Add technician</button>
                  <button type="button" onClick={() => commitDispatchTechRoster(d.id)} className="btn-primary">Save</button>
                </div>
              </SettingsGate>
            </SettingsOnly>
          </SettingsDetail>
        );
      })()}

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
