import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
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
  UserX
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users'));
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
  }, []);

  const updateUserStatus = async (uid: string, status: UserStatus) => {
    try {
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await updateDoc(userRef, { status });
    } catch (error) {
      alert("Permission denied. You must be an authorized admin to update status.");
      console.error("Error updating user status:", error);
    }
  };

  const updateUserRole = async (uid: string, role: Role) => {
    try {
      const userRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', uid);
      await updateDoc(userRef, { role });
    } catch (error) {
      alert("Permission denied. You must be an authorized admin to update roles.");
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
                      onClick={() => updateUserStatus(user.uid, 'approved')}
                      className="p-2.5 bg-brand-primary text-white rounded-xl hover:scale-105 transition-all shadow-lg shadow-brand-primary/20"
                      title="Approve User"
                    >
                      <UserCheck size={18} />
                    </button>
                    <button 
                      onClick={() => updateUserStatus(user.uid, 'rejected')}
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
                      <span className="text-xs font-bold text-slate-400 italic">{user.jobTitle}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <select 
                          value={user.role}
                          onChange={(e) => updateUserRole(user.uid, e.target.value as Role)}
                          className={cn(
                            "bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-brand-primary",
                            user.role === 'admin' ? "text-brand-primary" : "text-slate-400"
                          )}
                        >
                          <option value="admin">Admin</option>
                          <option value="Manager">Manager</option>
                          <option value="Salesperson">Salesperson</option>
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
