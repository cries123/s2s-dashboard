import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { User, Role, UserStatus } from '../../types';
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
  Target
} from 'lucide-react';
import { cn } from '../../lib/utils';

import { DEALERSHIPS } from '../../constants';
import { useAuth } from '../../hooks/useAuth';

interface AdminPanelProps {
  currentDealershipId?: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export default function AdminPanel({ currentDealershipId, onSuccess, onError }: AdminPanelProps) {
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
      onSuccess?.(`Settings updated for ${DEALERSHIPS.find(d => d.id === id)?.name}`);
    } catch (err) {
      console.error("Error updating settings:", err);
      onError?.("Failed to update dealership settings. Access denied.");
    }
  };

  // Local state for immediate slider feedback
  const [localAppTargets, setLocalAppTargets] = useState<Record<string, number>>({});
  const [localLaborTargets, setLocalLaborTargets] = useState<Record<string, number>>({});

  useEffect(() => {
    if (Object.keys(dealershipSettings).length > 0) {
      const appTargets: Record<string, number> = {};
      const laborTargets: Record<string, number> = {};
      Object.entries(dealershipSettings).forEach(([id, data]: [string, any]) => {
        if (data) {
          if (typeof data.appointmentTarget === 'number') {
            appTargets[id] = data.appointmentTarget;
          }
          if (typeof data.laborGrossTarget === 'number') {
            laborTargets[id] = data.laborGrossTarget;
          }
        }
      });
      setLocalAppTargets(prev => ({ ...prev, ...appTargets }));
      setLocalLaborTargets(prev => ({ ...prev, ...laborTargets }));
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

  const updateUserStatus = async (uid: string, status: UserStatus, userToUpdate?: User) => {
    try {
      if (!currentUser) return;
      
      // Managers cannot approve other managers
      if (currentUser.role !== 'admin' && userToUpdate?.isManager) {
        alert("Permission denied. Only system admins can approve manager accounts.");
        return;
      }

      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await updateDoc(userRef, { status });
    } catch (error) {
      alert("Permission denied. Ensure you have proper authority level.");
      console.error("Error updating user status:", error);
    }
  };

  const updateUserRole = async (uid: string, role: Role, userToUpdate?: User) => {
    try {
      if (!currentUser) return;
      
      // Safety check
      if (currentUser.role !== 'admin' && userToUpdate?.isManager) {
        alert("Managers cannot modify other managers.");
        return;
      }

      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await updateDoc(userRef, { role, isManager: role === 'Manager' || role === 'admin' });
    } catch (error) {
      alert("Permission denied. Insufficient administrative level.");
      console.error("Error updating user role:", error);
    }
  };

  const deleteUser = async (uid: string) => {
    if (!window.confirm("Permanently remove this user record? Authorization will be revoked.")) return;
    try {
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await deleteDoc(userRef);
    } catch (error) {
      alert("Permission denied. You must be an authorized admin to delete users.");
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Clock className="animate-spin text-brand-primary" size={40} />
        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Accessing Security Database...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">System Administration</h2>
          <p className="text-slate-400 mt-1 font-medium italic">Manage user permissions and security enrollment.</p>
        </div>
        
        <div className="relative w-full lg:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-primary" size={18} />
          <input
            type="text"
            placeholder="Search by name, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-6 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all font-medium shadow-2xl"
          />
        </div>
      </div>

      {/* Target Settings */}
      <div className="space-y-4">
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
            
            return (
              <div key={d.id} className={cn(
                "card-base p-6 transition-all duration-500 border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/20 col-span-full"
              )}>
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{d.name} Management</span>
                    <div className="flex gap-2">
                       <div className="px-2 py-1 bg-brand-primary/10 rounded border border-brand-primary/20">
                         <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">App Target: {appTarget}</span>
                       </div>
                       <div className="px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                         <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Labor Target: ${laborTarget.toLocaleString()}</span>
                       </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Appointment Target */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Daily Appointment Count</label>
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
                  </div>

                  <p className="text-[9px] text-slate-500 leading-relaxed italic">
                    These targets affect visual indicators and performance forecasting in the Operations and Sales tracking modules. Drag sliders or type to adjust.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pendingUsers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-amber-400">
            <Clock size={20} />
            <h3 className="text-lg font-black uppercase tracking-widest">Enrollment Requests</h3>
            <span className="bg-amber-500/10 text-amber-500 px-3 py-0.5 rounded-full text-xs font-black">
              {pendingUsers.length} Action Required
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {pendingUsers.map(user => (
              <div key={user.uid} className="card-base p-6 border-amber-500/20 bg-amber-500/5 ring-1 ring-amber-500/10">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-lg font-black text-white leading-tight">{user.username}</h4>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">{user.email}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-black uppercase tracking-widest">
                        {user.jobTitle}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => updateUserStatus(user.uid, 'approved', user)}
                      className="p-2.5 bg-brand-primary text-white rounded-xl hover:scale-105 transition-all shadow-lg shadow-brand-primary/20"
                      title="Approve User"
                    >
                      <UserCheck size={18} />
                    </button>
                    <button 
                      onClick={() => updateUserStatus(user.uid, 'rejected', user)}
                      className="p-2.5 bg-slate-800 text-rose-500 rounded-xl hover:scale-105 transition-all"
                      title="Reject User"
                    >
                      <UserX size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-3 text-slate-400">
          <Users size={20} />
          <h3 className="text-lg font-black uppercase tracking-widest">Authorized Access List</h3>
        </div>

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
                            "bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-brand-primary",
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
                      <button 
                        onClick={() => deleteUser(user.uid)}
                        className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Revoke Permission"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
