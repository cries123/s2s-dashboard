import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import { AuditLogEntry } from '../../../types';
import { cn } from '../../../lib/utils';
import {
  Users,
  Settings,
  ScrollText,
  Loader2,
} from 'lucide-react';
import {
  TENANT_PROFILES,
  TENANTS_COLLECTION_PATH,
  LOGS_COLLECTION_PATH,
  getTenantProfile,
} from '../../../lib/tenants';
import {
  resolveScopeTenantId,
} from '../../../lib/rbac';
import { MasterUserSettings } from './MasterUserSettings';
import { AdminEnrollmentQueue } from './AdminEnrollmentQueue';
import { logAuditAction } from '../../../services/loggingService';
import { DMS_PROVIDERS, normalizeDmsProvider, type DmsProviderId } from '../../../constants/dmsProviders';
import { defaultDmsProviderForDealership } from '../../../constants/dealerDefaults';
import { buildDmsProviderSettingsPatch } from '../../../lib/dealershipDmsSettings';

type ManagerTab = 'users' | 'settings' | 'logs';

interface ManagerDashboardProps {
  activeSubTab?: ManagerTab;
  onChangeSubTab?: (tab: ManagerTab) => void;
  currentDealershipId?: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export default function ManagerDashboard({
  activeSubTab = 'users',
  onChangeSubTab,
  currentDealershipId,
  onSuccess,
  onError,
}: ManagerDashboardProps) {
  const [internalSubTab, setInternalSubTab] = useState<ManagerTab>(activeSubTab);

  useEffect(() => {
    setInternalSubTab(activeSubTab);
  }, [activeSubTab]);

  const subTab = onChangeSubTab ? activeSubTab : internalSubTab;
  const handleSubTabChange = (tab: ManagerTab) => {
    if (onChangeSubTab) onChangeSubTab(tab);
    else setInternalSubTab(tab);
  };
  const { user: currentUser } = useAuth();
  const tenantId = resolveScopeTenantId(currentUser, currentDealershipId);
  const tenantProfile = getTenantProfile(tenantId);
  const dealershipId = tenantProfile?.dealershipId || currentDealershipId || 'hyundai';

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [dmsProvider, setDmsProvider] = useState<DmsProviderId>(() =>
    defaultDmsProviderForDealership(dealershipId)
  );
  const [dealershipSettings, setDealershipSettings] = useState<{
    performanceAdvisorRoster?: { id: string; label: string }[];
  } | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [savingDms, setSavingDms] = useState(false);

  useEffect(() => {
    if (!currentUser || !tenantId) return;

    TENANT_PROFILES.forEach((t) => {
      setDoc(
        doc(db, ...TENANTS_COLLECTION_PATH, t.tenantId),
        {
          tenantId: t.tenantId,
          name: t.name,
          dmsProvider: t.dmsProvider,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {});
    });
  }, [currentUser, tenantId]);

  useEffect(() => {
    if (!currentUser || !tenantId) return;

    const logsQuery = query(
      collection(db, ...LOGS_COLLECTION_PATH),
      where('tenantId', '==', tenantId),
      orderBy('timestamp', 'desc'),
      limit(150)
    );

    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogEntry)));
      setLoadingLogs(false);
    }, () => setLoadingLogs(false));

    return () => unsubLogs();
  }, [currentUser, tenantId]);

  useEffect(() => {
    if (!dealershipId) return;
    const settingsRef = doc(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'dealershipSettings',
      dealershipId
    );
    const unsub = onSnapshot(settingsRef, (snap) => {
      const data = snap.exists() ? snap.data() : null;
      setDealershipSettings(data);
      setDmsProvider(
        data?.dmsProvider
          ? normalizeDmsProvider(data.dmsProvider as string)
          : defaultDmsProviderForDealership(dealershipId)
      );
    });
    return () => unsub();
  }, [dealershipId]);

  const saveDmsProvider = async (next: DmsProviderId) => {
    if (!currentUser || !dealershipId) return;
    setSavingDms(true);
    try {
      const patch = buildDmsProviderSettingsPatch(dealershipId, next, dealershipSettings);
      await setDoc(
        doc(
          db,
          'artifacts',
          'hyundai-sales-to-service',
          'public',
          'data',
          'dealershipSettings',
          dealershipId
        ),
        { ...patch, id: dealershipId, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await setDoc(
        doc(db, ...TENANTS_COLLECTION_PATH, tenantId),
        {
          tenantId,
          name: tenantProfile?.name || tenantId,
          dmsProvider: next,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await logAuditAction('Update DMS Provider', `DMS provider set to ${next}`, tenantId, currentUser);
      onSuccess?.('DMS provider saved for report parsing.');
    } catch (err: any) {
      onError?.(err.message || 'Failed to save DMS settings');
    } finally {
      setSavingDms(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest block mb-1">Manager Control Panel</span>
          <h1 className="text-2xl font-black text-white uppercase tracking-wider">{tenantProfile?.name || tenantId}</h1>
          <p className="text-slate-500 text-sm mt-1">Dealership user administration, enrollments, and audit trail</p>
        </div>
        <div className="flex gap-2 p-1 bg-slate-900/80 border border-white/5 rounded-xl">
          {([
            { id: 'users' as const, label: 'Users', icon: Users },
            { id: 'settings' as const, label: 'Tenant Settings', icon: Settings },
            { id: 'logs' as const, label: 'Audit Logs', icon: ScrollText },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSubTabChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                subTab === tab.id ? 'bg-brand-primary text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'users' && (
        <>
          <AdminEnrollmentQueue
            scopeTenantId={tenantId}
            onSuccess={onSuccess}
            onError={onError}
          />
          <MasterUserSettings
            managerMode
            scopeTenantId={tenantId}
            onSuccess={onSuccess}
            onError={onError}
          />
        </>
      )}

      {subTab === 'settings' && (
        <div className="card-base p-8 max-w-lg">
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6">DMS Configuration</h3>
          <p className="text-xs text-slate-500 mb-4">
            Saved automatically for <span className="text-white font-bold">{tenantProfile?.name}</span>. Report PDF
            imports use this to pick the PBS or DealerBuilt parser.
          </p>
          <label className="input-label">DMS Provider</label>
          <select
            value={dmsProvider}
            disabled={savingDms}
            onChange={(e) => {
              const next = e.target.value as DmsProviderId;
              setDmsProvider(next);
              void saveDmsProvider(next);
            }}
            className="input-field w-full mb-4"
          >
            {DMS_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500 leading-relaxed flex items-center gap-2">
            {savingDms ? <Loader2 className="animate-spin shrink-0" size={14} /> : null}
            {DMS_PROVIDERS.find((p) => p.id === dmsProvider)?.description}
          </p>
        </div>
      )}

      {subTab === 'logs' && (
        <div className="card-base overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Audit Logs — {tenantId}</h3>
            <p className="text-[10px] text-slate-500 mt-1">Isolated to your tenant only</p>
          </div>
          {loadingLogs ? (
            <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-brand-primary" /></div>
          ) : logs.length === 0 ? (
            <p className="p-8 text-center text-slate-500 text-sm">No audit entries yet for this tenant.</p>
          ) : (
            <div className="max-h-[520px] overflow-y-auto divide-y divide-white/5">
              {logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-white/[0.02]">
                  <div className="flex justify-between gap-4 mb-1">
                    <span className="text-xs font-black text-brand-primary uppercase">{log.action}</span>
                    <span className="text-[10px] text-slate-600 font-mono">
                      {log.timestamp?.toDate?.()?.toLocaleString?.() || '—'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">{log.details}</p>
                  <p className="text-[10px] text-slate-600 mt-1">{log.username || log.userEmail} · {log.userId?.slice(0, 8)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
