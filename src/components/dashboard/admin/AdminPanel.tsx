import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, where, setDoc, serverTimestamp } from 'firebase/firestore';
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
  FileText
} from 'lucide-react';
import { cn } from '../../../lib/utils';

import { DEALERSHIPS } from '../../../constants';
import { useAuth } from '../../../hooks/useAuth';
import { SystemLogs } from './SystemLogs';
import { logSystemAction } from '../../../services/loggingService';

interface AdminPanelProps {
  key?: string;
  currentDealershipId?: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
  activeSubTab?: 'operations' | 'users' | 'logs';
  onChangeSubTab?: (tab: 'operations' | 'users' | 'logs') => void;
}

export default function AdminPanel({ 
  currentDealershipId, 
  onSuccess, 
  onError, 
  activeSubTab, 
  onChangeSubTab 
}: AdminPanelProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dealershipSettings, setDealershipSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!currentUser) return;

    // Fetch settings for all dealerships if admin, or just current
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

  // Local state for immediate slider feedback
  const [localAppTargets, setLocalAppTargets] = useState<Record<string, number>>({});
  const [localLaborTargets, setLocalLaborTargets] = useState<Record<string, number>>({});
  const [localPartsTargets, setLocalPartsTargets] = useState<Record<string, number>>({});

  useEffect(() => {
    if (Object.keys(dealershipSettings).length > 0) {
      const appTargets: Record<string, number> = {};
      const laborTargets: Record<string, number> = {};
      const partsTargets: Record<string, number> = {};
      Object.entries(dealershipSettings).forEach(([id, data]: [string, any]) => {
        if (data) {
          if (typeof data.appointmentTarget === 'number') {
            appTargets[id] = data.appointmentTarget;
          }
          if (typeof data.laborGrossTarget === 'number') {
            laborTargets[id] = data.laborGrossTarget;
          }
          if (typeof data.partsSalesTarget === 'number') {
            partsTargets[id] = data.partsSalesTarget;
          }
        }
      });
      setLocalAppTargets(prev => ({ ...prev, ...appTargets }));
      setLocalLaborTargets(prev => ({ ...prev, ...laborTargets }));
      setLocalPartsTargets(prev => ({ ...prev, ...partsTargets }));
    }
  }, [dealershipSettings]);

  const commitAppTargetChange = (id: string) => {
    const value = localAppTargets[id] ?? (dealershipSettings[id]?.appointmentTarget || 20);
    updateSetting(id, { appointmentTarget: value });
  };

  const commitLaborTargetChange = (id: string) => {
    const value = localLaborTargets[id] ?? (dealershipSettings[id]?.laborGrossTarget || 500000);
    updateSetting(id, { laborGrossTarget: value });
  };

  const commitPartsTargetChange = (id: string) => {
    const value = localPartsTargets[id] ?? (dealershipSettings[id]?.partsSalesTarget || 300000);
    updateSetting(id, { partsSalesTarget: value });
  };

  useEffect(() => {
    if (!currentUser) return;

    let q = query(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users'));
    
    // Scoped query for managers to comply with security rules
    if (currentUser.role !== 'admin' && currentUser.isManager && currentUser.dealershipId) {
      q = query(
        collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users'),
        where('dealershipId', '==', currentUser.dealershipId)
      );
    }

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
        setUsers(usersData);
        setLoading(false);
      },
      (error) => {
        console.error("AdminPanel Snapshot Error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const [confirmDeleteUid, setConfirmDeleteId] = useState<string | null>(null);

  const updateUserStatus = async (uid: string, status: UserStatus, userToUpdate?: User) => {
    try {
      if (!currentUser) return;
      
      // Managers cannot approve other managers
      if (currentUser.role !== 'admin' && userToUpdate?.isManager) {
        onError?.("Permission denied. Only system admins can approve manager accounts.");
        return;
      }

      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await updateDoc(userRef, { status });

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

  const updateUserRole = async (uid: string, role: Role, userToUpdate?: User) => {
    try {
      if (!currentUser) return;
      
      // Safety check
      if (currentUser.role !== 'admin' && userToUpdate?.isManager) {
        onError?.("Managers cannot modify other managers.");
        return;
      }

      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await updateDoc(userRef, { role, isManager: role === 'Manager' || role === 'admin' });

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

  const deleteUser = async (uid: string) => {
    try {
      if (!currentUser) return;
      
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

  const pendingUsers = filteredUsers.filter(u => u.status === 'pending');
  const activeUsers = filteredUsers.filter(u => u.status === 'approved' || u.status === 'rejected');

  const subTab = activeSubTab || 'operations';

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* 1. Header with Title + Description */}
      <div className="border-b border-white/5 pb-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand-primary text-[9px] font-black uppercase tracking-[0.25em] mb-1.5 select-none md:mb-1">
              <Shield size={12} className="text-brand-primary animate-pulse w-3 h-3" />
              Secure Administrative Access Point
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase leading-none">System Administration</h2>
          </div>
          
          <div className="bg-slate-950/40 border border-white/5 rounded-2xl px-4 py-3 max-w-lg w-full lg:w-auto mt-2 lg:mt-0 shadow-lg select-none">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider italic leading-relaxed">
              {subTab === 'operations' && "Configure dealership daily throughput, gross parts & labor dollar targets."}
              {subTab === 'users' && "Manage system permission tiers, account access, & registration flows."}
              {subTab === 'logs' && "Real-time forensic audit logs of user actions on the app."}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Sleek Segmented glass navigation bar */}
      <div className="bg-slate-950/35 p-1.5 rounded-[22px] border border-white/5 backdrop-blur-md shadow-2xl relative overflow-hidden ring-1 ring-black/30">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { id: 'operations', label: 'Operations', icon: Target, desc: 'Operational Targets' },
            { id: 'users', label: 'User Settings', icon: Users, desc: 'Identity & Access' },
            { id: 'logs', label: 'Logs', icon: FileText, desc: 'System Audit Logs' }
          ].map(tab => {
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

      {/* 2. Sub-tab Content Panels */}

      {/* OPERATIONS TARGETS PANEL */}
      {subTab === 'operations' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 text-brand-primary">
            <Target size={20} />
            <h3 className="text-lg font-black uppercase tracking-widest text-white">Dealership Operations Settings</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {DEALERSHIPS.filter(d => d.id === currentDealershipId).map(d => {
              // Managers can only see/edit their own dealership settings
              if (currentUser?.role !== 'admin' && currentUser?.dealershipId !== d.id) return null;

              const appTarget = localAppTargets[d.id] ?? (dealershipSettings[d.id]?.appointmentTarget || 20);
              const laborTarget = localLaborTargets[d.id] ?? (dealershipSettings[d.id]?.laborGrossTarget || 500000);
              const partsTarget = localPartsTargets[d.id] ?? (dealershipSettings[d.id]?.partsSalesTarget || 300000);
              
              return (
                <div key={d.id} className={cn(
                  "card-base p-6 transition-all duration-500 border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/20 col-span-full"
                )}>
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{d.name} Management</span>
                      <div className="flex gap-2">
                        <div className="px-2 py-1 bg-brand-primary/10 rounded border border-brand-primary/20">
                          <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">App: {appTarget}</span>
                        </div>
                        <div className="px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                          <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Labor: ${laborTarget.toLocaleString()}</span>
                        </div>
                        <div className="px-2 py-1 bg-brand-secondary/10 rounded border border-brand-secondary/20">
                          <span className="text-[10px] font-black text-brand-secondary uppercase tracking-widest">Parts: ${partsTarget.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      {/* Appointment Target */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Daily Appointments</label>
                          <span className="text-brand-primary font-black text-xs">{appTarget} / Day</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input 
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={appTarget}
                            onChange={(e) => setLocalAppTargets(prev => ({ ...prev, [d.id]: parseInt(e.target.value) }))}
                            onMouseUp={() => commitAppTargetChange(d.id)}
                            onTouchEnd={() => commitAppTargetChange(d.id)}
                            className="flex-1 accent-brand-primary cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-800"
                          />
                          <input 
                            type="number"
                            min="1"
                            max="100"
                            value={appTarget}
                            onChange={(e) => setLocalAppTargets(prev => ({ ...prev, [d.id]: parseInt(e.target.value) || 0 }))}
                            onBlur={() => commitAppTargetChange(d.id)}
                            onKeyDown={(e) => e.key === 'Enter' && commitAppTargetChange(d.id)}
                            className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs font-black text-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                          />
                        </div>
                      </div>

                      <div className="space-y-8">
                        {/* Labor Gross Target */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Monthly Labor Gross Goal</label>
                            <span className="text-emerald-500 font-black text-xs">${laborTarget.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <input 
                              type="range"
                              min="100000"
                              max="2000000"
                              step="10000"
                              value={laborTarget}
                              onChange={(e) => setLocalLaborTargets(prev => ({ ...prev, [d.id]: parseInt(e.target.value) }))}
                              onMouseUp={() => commitLaborTargetChange(d.id)}
                              onTouchEnd={() => commitLaborTargetChange(d.id)}
                              className="flex-1 accent-emerald-500 cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-800"
                            />
                            <input 
                              type="number"
                              min="0"
                              value={laborTarget}
                              onChange={(e) => setLocalLaborTargets(prev => ({ ...prev, [d.id]: parseInt(e.target.value) || 0 }))}
                              onBlur={() => commitLaborTargetChange(d.id)}
                              onKeyDown={(e) => e.key === 'Enter' && commitLaborTargetChange(d.id)}
                              className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs font-black text-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                            />
                          </div>
                        </div>

                        {/* Parts Sales Target */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Monthly Parts Gross Goal</label>
                            <span className="text-brand-secondary font-black text-xs">${partsTarget.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <input 
                              type="range"
                              min="5000"
                              max="1500000"
                              step="10000"
                              value={partsTarget}
                              onChange={(e) => setLocalPartsTargets(prev => ({ ...prev, [d.id]: parseInt(e.target.value) }))}
                              onMouseUp={() => commitPartsTargetChange(d.id)}
                              onTouchEnd={() => commitPartsTargetChange(d.id)}
                              className="flex-1 accent-brand-secondary cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-800"
                            />
                            <input 
                              type="number"
                              min="0"
                              value={partsTarget}
                              onChange={(e) => setLocalPartsTargets(prev => ({ ...prev, [d.id]: parseInt(e.target.value) || 0 }))}
                              onBlur={() => commitPartsTargetChange(d.id)}
                              onKeyDown={(e) => e.key === 'Enter' && commitPartsTargetChange(d.id)}
                              className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs font-black text-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                            />
                          </div>
                        </div>

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

      {/* USER SETTINGS / ROLES PANEL */}
      {subTab === 'users' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Header containing the User search widget inside the tab section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <h3 className="text-lg font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <Users size={18} /> User Access Matrix
            </h3>
            
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-primary" size={14} />
              <input
                type="text"
                placeholder="Filter identity by keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-primary font-medium"
              />
            </div>
          </div>

          {/* Pending Signups */}
          {pendingUsers.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-amber-400">
                <Clock size={18} />
                <h4 className="text-sm font-black uppercase tracking-widest text-white">Enrollment Requests</h4>
                <span className="bg-amber-500/10 text-amber-500 px-3 py-0.5 rounded-full text-[10px] font-black">
                  {pendingUsers.length} Action Required
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingUsers.map(user => (
                  <div key={user.uid} className="card-base p-6 border-amber-500/20 bg-amber-500/5 ring-1 ring-amber-500/10">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-black text-white leading-tight">{user.username}</h4>
                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">{user.email}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-black uppercase tracking-widest">
                            {user.jobTitle}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => updateUserStatus(user.uid, 'approved', user)}
                          className="p-2 bg-brand-primary text-white rounded-xl hover:scale-105 transition-all shadow-lg shadow-brand-primary/20"
                          title="Approve User"
                        >
                          <UserCheck size={16} />
                        </button>
                        <button 
                          onClick={() => updateUserStatus(user.uid, 'rejected', user)}
                          className="p-2 bg-slate-800 text-rose-500 rounded-xl hover:scale-105 transition-all"
                          title="Reject User"
                        >
                          <UserX size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User list Table */}
          <div className="space-y-4">
            <h4 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Users size={16} /> Authorized Access Directory ({activeUsers.length})
            </h4>

            <div className="card-base p-0 overflow-hidden border-slate-800">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/50 border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                      <th className="px-6 py-4">Identity</th>
                      <th className="px-6 py-4">Location</th>
                      <th className="px-6 py-4">Internal Title</th>
                      <th className="px-6 py-4">Permissions</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {activeUsers.map(user => (
                      <tr key={user.uid} className="hover:bg-slate-900/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-white">{user.username}</span>
                            <span className="text-[10px] font-bold text-slate-500">{user.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest px-2 py-1 bg-brand-primary/5 rounded border border-brand-primary/10">
                            {DEALERSHIPS.find(d => d.id === user.dealershipId)?.name.split(' ')[0] || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-slate-400 italic">{user.jobTitle}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <select 
                              value={user.role}
                              onChange={(e) => updateUserRole(user.uid, e.target.value as Role, user)}
                              className={cn(
                                "bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-brand-primary",
                                user.role === 'admin' ? "text-brand-primary" : "text-slate-400"
                              )}
                            >
                              <option value="admin">System Admin</option>
                              <option value="Manager">Manager</option>
                              <option value="Salesperson">Sales Professional</option>
                              <option value="Service Advisor">Service Advisor</option>
                              <option value="Staff">Staff</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Approved</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {confirmDeleteUid === user.uid ? (
                            <div className="flex items-center justify-end gap-2 animate-in slide-in-from-right-2 duration-300">
                              <button 
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-[9px] font-black text-slate-500 uppercase hover:text-white"
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={() => deleteUser(user.uid)}
                                className="px-3 py-1.5 bg-rose-500 text-white text-[9px] font-black uppercase rounded shadow-lg shadow-rose-500/20"
                              >
                                Confirm
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setConfirmDeleteId(user.uid)}
                              className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Revoke Permission"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SYSTEM TRAILS / LOGS */}
      {subTab === 'logs' && (
        <div className="animate-in fade-in duration-300">
          <SystemLogs />
        </div>
      )}

    </div>
  );
}
