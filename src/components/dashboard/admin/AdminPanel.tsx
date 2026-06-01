import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, where, setDoc, serverTimestamp, addDoc, getDocs } from 'firebase/firestore';
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
  Upload,
  FileSpreadsheet,
  Play,
  Check,
  Loader2,
  Database,
  RefreshCw,
  SlidersHorizontal
} from 'lucide-react';
import { cn } from '../../../lib/utils';

import { DEALERSHIPS } from '../../../constants';
import { DISPATCH_PRODUCTION_LANES, DEFAULT_DISPATCH_LANE_CAPACITY, mergeLaneCapacity, DispatchProductionLane } from '../../../lib/dispatchConfig';
import { useAuth } from '../../../hooks/useAuth';
import { SystemLogs } from './SystemLogs';
import { SettingsPage } from '../../settings/SettingsPage';
import { LandingTab } from '../../../types';
import { logSystemAction } from '../../../services/loggingService';

interface AdminPanelProps {
  key?: string;
  currentDealershipId?: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
  activeSubTab?: 'operations' | 'users' | 'logs' | 'preferences';
  onChangeSubTab?: (tab: 'operations' | 'users' | 'logs' | 'preferences') => void;
  onNavigateTab?: (tab: LandingTab) => void;
}

export default function AdminPanel({ 
  currentDealershipId, 
  onSuccess, 
  onError, 
  activeSubTab, 
  onChangeSubTab,
  onNavigateTab
}: AdminPanelProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dealershipSettings, setDealershipSettings] = useState<Record<string, any>>({});

  // CRM CSV Importer states
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

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

  const parseVehicle = (vehicleStr: string) => {
    const clean = (vehicleStr || "").trim().toUpperCase();
    const parts = clean.split(/\s+/);
    let year = "2026";
    let make = "FORD";
    let model = clean;

    if (parts.length > 0 && /^\d{4}$/.test(parts[0])) {
      year = parts[0];
      parts.shift();
    }

    const rest = parts.join(" ");
    if (rest.startsWith("FORD ")) {
      make = "FORD";
      model = rest.substring(5);
    } else if (rest.startsWith("LINCOLN ")) {
      make = "LINCOLN";
      model = rest.substring(8);
    } else if (rest.startsWith("TOYOTA ")) {
      make = "TOYOTA";
      model = rest.substring(7);
    } else if (rest.startsWith("HONDA ")) {
      make = "HONDA";
      model = rest.substring(6);
    } else if (rest.startsWith("CHEVY ") || rest.startsWith("CHEVROLET ")) {
      make = "CHEVROLET";
      model = rest.substring(rest.startsWith("CHEVY ") ? 6 : 10);
    } else if (rest.startsWith("JEEP ")) {
      make = "JEEP";
      model = rest.substring(5);
    } else if (rest.startsWith("MAZDA ")) {
      make = "MAZDA";
      model = rest.substring(6);
    } else if (rest.startsWith("NISSAN ")) {
      make = "NISSAN";
      model = rest.substring(7);
    } else if (rest.startsWith("HYUNDAI ")) {
      make = "HYUNDAI";
      model = rest.substring(8);
    } else if (rest.startsWith("KIA ")) {
      make = "KIA";
      model = rest.substring(4);
    } else {
      if (clean.includes("WRANGLER")) {
        make = "JEEP";
        model = rest || "WRANGLER";
      } else if (clean.includes("MUSTANG")) {
        make = "FORD";
        model = rest || "MUSTANG";
      } else if (clean.includes("MAVERICK")) {
        make = "FORD";
        model = rest || "MAVERICK";
      } else if (clean.includes("EXPLORER")) {
        make = "FORD";
        model = rest || "EXPLORER";
      } else if (clean.includes("F150") || clean.includes("F-150") || clean.includes("RAPTOR")) {
        make = "FORD";
        model = rest || "F150";
      } else if (clean.includes("EXPEDITION")) {
        make = "FORD";
        model = rest || "EXPEDITION";
      } else if (clean.includes("ESCAPE")) {
        make = "FORD";
        model = rest || "ESCAPE";
      } else if (clean.includes("RANGER")) {
        make = "FORD";
        model = rest || "RANGER";
      } else if (clean.includes("NAUTILUS") || clean.includes("NAVIGATOR") || clean.includes("AVIATOR") || clean.includes("CORSAIR")) {
        make = "LINCOLN";
        model = rest || clean;
      } else if (clean.includes("F350") || clean.includes("F250") || clean.includes("F550") || clean.includes("BRONCO")) {
        make = "FORD";
        model = rest || clean;
      } else {
        make = "FORD";
        model = rest || clean;
      }
    }

    return { 
      year, 
      make: make.charAt(0).toUpperCase() + make.slice(1).toLowerCase(), 
      model: model.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') 
    };
  };

  const parseCSVData = (text: string) => {
    try {
      const lines = text.split(/\r?\n/);
      if (lines.length === 0) return [];

      const firstLine = lines[0];
      if (!firstLine) return [];
      
      const headers = firstLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
      
      const results: any[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        let cells: string[] = [];
        let insideQuote = false;
        let currentCell = '';
        
        for (let charIndex = 0; charIndex < line.length; charIndex++) {
          const char = line[charIndex];
          if (char === '"' || char === "'") {
            insideQuote = !insideQuote;
          } else if (char === ',' && !insideQuote) {
            cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));
            currentCell = '';
          } else {
            currentCell += char;
          }
        }
        cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));

        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = cells[index] || '';
        });
        
        results.push(row);
      }

      const mapped = results.map(item => {
        const getVal = (keys: string[]) => {
          const foundKey = Object.keys(item).find(k => keys.some(key => k.toLowerCase().includes(key.toLowerCase())));
          return foundKey ? item[foundKey].trim() : '';
        };

        const firstName = getVal(['first', 'fn']);
        const lastName = getVal(['last', 'ln']);
        const phone = getVal(['phone', 'tel']);
        const email = getVal(['email', 'mail']);
        const vehicle = getVal(['vehicle', 'model', 'car']);
        const vin = getVal(['vin']);
        const salesman = getVal(['salesman', 'salesperson', 'rep', 'soldby']);
        const notes = getVal(['notes', 'note']);
        const serviceDate = getVal(['servicedate', 'date', 'solddate']);

        return {
          firstName,
          lastName,
          phone,
          email,
          vehicle,
          vin,
          salesman,
          notes,
          serviceDate
        };
      }).filter(row => row.firstName || row.lastName || row.vin);

      setParsedRows(mapped);
      setImportLogs([`Parsed ${mapped.length} customer records. File ready to import.`]);
      return mapped;
    } catch (e: any) {
      console.error(e);
      setImportLogs(prev => [...prev, `Error parsing CSV: ${e.message}`]);
      return [];
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      parseCSVData(text);
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvText(text);
        parseCSVData(text);
      };
      reader.readAsText(file);
    }
  };

  const executeCRMImport = async () => {
    if (parsedRows.length === 0) return;
    if (!currentUser) return;
    setIsImporting(true);
    setImportProgress(0);
    setImportLogs(prev => [...prev, "Initiating Cloud sync...", "Checking existing customers for duplicate checks..."]);

    try {
      const dbDealershipId = currentDealershipId || 'ford';
      const customersRef = collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers');
      const q = query(customersRef, where('dealershipId', '==', dbDealershipId));
      const querySnapshot = await getDocs(q);
      
      const existingMap = new Map();
      querySnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const vin = (data.vin || '').trim().toUpperCase();
        if (vin) {
          existingMap.set(vin, { id: docSnap.id, ...data });
        }
      });

      setImportLogs(prev => [...prev, `Preloaded ${existingMap.size} existing dealership clients for matching.`]);

      let newCount = 0;
      let updateCount = 0;

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const vinfo = parseVehicle(row.vehicle);
        const uppercaseVin = (row.vin || '').trim().toUpperCase();
        const vin8 = uppercaseVin.length >= 8 ? uppercaseVin.slice(-8) : uppercaseVin;

        let soldDate = `${vinfo.year}-01-01`;
        if (row.serviceDate) {
          const sDate = new Date(row.serviceDate);
          if (!isNaN(sDate.getTime()) && sDate.getFullYear() < parseInt(vinfo.year)) {
            soldDate = `${sDate.getFullYear()}-01-01`;
          }
        }

        const recentVisitsToSave = [];
        if (row.serviceDate) {
          recentVisitsToSave.push({
            id: Math.random().toString(36).substring(7),
            soNumber: `IMPORT-${Math.floor(1000 + Math.random() * 9000)}`,
            date: row.serviceDate,
            mileage: 15000,
            advisor: "DATABASE IMPORT",
            requests: "Imported Historic Service Reminder record",
            createdAt: new Date().toISOString()
          });
        }

        const customerPayload: any = {
          firstName: row.firstName || 'Unknown',
          lastName: row.lastName || 'Customer',
          phone: row.phone || '',
          email: row.email || '',
          make: vinfo.make,
          model: vinfo.model,
          year: vinfo.year,
          vin: uppercaseVin,
          vinLast8: vin8,
          soldDate: soldDate,
          language: 'English',
          enableServiceAlert: true,
          serviceAlertTriggered: false,
          notes: row.notes || '',
          salesman: row.salesman || '',
          dealershipId: dbDealershipId,
          recentVisits: recentVisitsToSave
        };

        const existingRecord = uppercaseVin ? existingMap.get(uppercaseVin) : null;
        
        if (existingRecord) {
          const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', existingRecord.id);
          const mergedVisits = [...customerPayload.recentVisits];
          if (existingRecord.recentVisits && Array.isArray(existingRecord.recentVisits)) {
            existingRecord.recentVisits.forEach((v: any) => {
              if (!mergedVisits.some(mv => mv.date === v.date)) {
                mergedVisits.push(v);
              }
            });
          }
          
          await updateDoc(docRef, {
            ...customerPayload,
            recentVisits: mergedVisits,
            notes: row.notes || existingRecord.notes || '',
            lastServiceContact: existingRecord.lastServiceContact || null,
            lastContactOutcome: existingRecord.lastContactOutcome || '',
            serviceAlertTriggered: existingRecord.serviceAlertTriggered !== undefined ? existingRecord.serviceAlertTriggered : false
          });
          
          updateCount++;
          setImportLogs(prev => [...prev, `• Combined: ${customerPayload.firstName} ${customerPayload.lastName} (${customerPayload.year} ${customerPayload.model}) linked dynamically.`]);
        } else {
          const docRef = doc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers'));
          const finalNewRecord = {
            ...customerPayload,
            createdAt: serverTimestamp(),
            addedBy: currentUser.uid,
            addedByUsername: currentUser.username
          };
          
          await setDoc(docRef, finalNewRecord);
          newCount++;
          setImportLogs(prev => [...prev, `• Added CRM: ${customerPayload.firstName} ${customerPayload.lastName} (${customerPayload.year} ${customerPayload.model}) - Sold by: ${customerPayload.salesman || 'None'}`]);
        }

        setImportProgress(i + 1);
        await new Promise(resolve => setTimeout(resolve, 8));
      }

      setImportLogs(prev => [...prev, "Writing execution records to diagnostic stream...", "Syncing system logs..."]);

      await logSystemAction(
        "Database Import",
        `CRM Importer completed: Registered ${newCount} new and updated ${updateCount} existing customer records for ${currentDealershipId || 'ford'}.`,
        'settings',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId || currentDealershipId || 'ford'
      );

      setImportLogs(prev => [...prev, `🎉 Import Complete! Created ${newCount} profiles, Reconciled ${updateCount} records. S2S Reminders updated successfully.`]);
      onSuccess?.(`Import completed: Processed ${parsedRows.length} CRM records.`);
      
      setCsvText('');
      setFileName('');
      setParsedRows([]);
    } catch (error: any) {
      console.error(error);
      setImportLogs(prev => [...prev, `❌ CRITICAL FIREBASE ERROR: ${error.message}`]);
      onError?.("Failed to save imported customer records. Perms Denied.");
    } finally {
      setIsImporting(false);
    }
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
              {subTab === 'preferences' && "Personal workspace settings for contact workflow, modules, and CRM display."}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Sleek Segmented glass navigation bar */}
      <div className="bg-slate-950/35 p-1.5 rounded-[22px] border border-white/5 backdrop-blur-md shadow-2xl relative overflow-hidden ring-1 ring-black/30">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { id: 'operations', label: 'Operations', icon: Target, desc: 'Operational Targets' },
            { id: 'users', label: 'User Settings', icon: Users, desc: 'Identity & Access' },
            { id: 'logs', label: 'Logs', icon: FileText, desc: 'System Audit Logs' },
            { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal, desc: 'Your Workspace' }
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
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          {/* CRM DATABASE IMPORTER */}
          <div className="card-base p-6 border-slate-800 bg-slate-950/20 backdrop-blur-3xl col-span-full mt-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <Database size={20} className="text-brand-secondary/80" />
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-white">Direct CRM Database Importer</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Sync fleet vehicles, sales representatives and service history to client profiles</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upload Drop Zone */}
              <div className="space-y-4">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic block">Method 1: File Transfer (.csv)</label>
                
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={cn(
                    "h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center transition-all cursor-pointer select-none relative overflow-hidden",
                    dragActive 
                      ? "border-brand-primary bg-brand-primary/10 shadow-lg shadow-brand-primary/15" 
                      : fileName 
                        ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60" 
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700/60"
                  )}
                >
                  <input 
                    type="file" 
                    accept=".csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={isImporting}
                  />
                  
                  {fileName ? (
                    <div className="space-y-3 animate-fade-in">
                      <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl flex items-center justify-center mx-auto">
                        <FileSpreadsheet size={24} />
                      </div>
                      <div>
                        <p className="text-xs font-black text-white">{fileName}</p>
                        <p className="text-[9px] text-emerald-400 font-black uppercase tracking-wider mt-1">{parsedRows.length} Valid Records Detected</p>
                      </div>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setFileName('');
                          setCsvText('');
                          setParsedRows([]);
                        }}
                        className="px-3 py-1 bg-slate-950 text-slate-400 hover:text-white rounded text-[8px] font-black uppercase border border-slate-800 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-12 h-12 bg-slate-950 text-slate-500 border border-white/5 rounded-xl flex items-center justify-center mx-auto transition-transform">
                        <Upload size={20} className="text-brand-primary animate-bounce mt-1" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-white uppercase tracking-wide">Drag & Drop Customer Database CSV File</p>
                        <p className="text-[9px] text-slate-500 font-medium mt-1 leading-normal">Or click to select spreadsheet. Column headers must align.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Paste raw content */}
              <div className="space-y-4">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic block">Method 2: Direct delimiters Copy-Paste (Raw CRM CSV data)</label>
                
                <div className="relative">
                  <textarea
                    value={csvText}
                    onChange={(e) => {
                      setCsvText(e.target.value);
                      parseCSVData(e.target.value);
                    }}
                    disabled={isImporting}
                    placeholder="First,Last,Phone,Email,Vehicle,VIN,Salesman,Notes,ServiceDate&#10;SELINA,QUIROGA,,COSMOQUEENDIVA@YAHOO.COM,2021 WRANGLER,1C4HJXEN3MW744126,DIEGO,NIPOMO,2026-04-30..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-[10px] font-mono leading-relaxed h-48 focus:outline-none focus:ring-1 focus:ring-brand-primary text-slate-300 placeholder:text-slate-600 resize-none"
                  />
                  
                  {csvText && (
                    <button
                      type="button"
                      onClick={() => {
                        setCsvText('');
                        setParsedRows([]);
                        setFileName('');
                        setImportLogs([]);
                      }}
                      className="absolute top-3 right-3 px-2 py-1 bg-slate-950 text-slate-500 hover:text-white rounded text-[8px] font-black uppercase border border-slate-800 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Parsed Output Summary & execution triggers */}
            {parsedRows.length > 0 && (
              <div className="pt-4 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 animate-slide-in">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-primary/10 rounded-xl border border-brand-primary/20 flex items-center justify-center text-brand-primary">
                    <Database size={16} />
                  </div>
                  <div>
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Validated Stream Readiness</span>
                    <p className="text-xs font-black text-white uppercase mt-0.5">Ready to incorporate {parsedRows.length} customers to Santa Maria {DEALERSHIPS.find(d => d.id === (currentDealershipId || 'ford'))?.name.split(' ')[0] || 'Ford'}</p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isImporting}
                  onClick={executeCRMImport}
                  className="px-6 py-3.5 bg-brand-primary hover:bg-brand-primary/95 text-slate-950 rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] transition-all flex items-center gap-2.5 shadow-xl shadow-brand-primary/15 hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-50 w-full md:w-auto justify-center"
                >
                  {isImporting ? <Loader2 className="animate-spin" size={14} /> : <Play size={12} />}
                  {isImporting ? `Logging ${importProgress} / ${parsedRows.length}...` : 'Start DB Integration'}
                </button>
              </div>
            )}

            {/* Real-time scrolling transaction consoles */}
            {importLogs.length > 0 && (
              <div className="space-y-3">
                <div className="flex justify-between items-center select-none">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic flex items-center gap-2">
                    <RefreshCw size={12} className={cn("text-brand-primary", isImporting && "animate-spin")} /> CRM Import Diagnostic Terminal
                  </label>
                  {isImporting && (
                    <span className="text-[10px] font-mono text-slate-400 font-bold">
                      {Math.round((importProgress / parsedRows.length) * 100)}%
                    </span>
                  )}
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 h-48 overflow-y-auto font-mono text-[9px] leading-relaxed text-slate-400 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 shadow-inner">
                  {importLogs.map((log, index) => (
                    <div 
                      key={index} 
                      className={cn(
                        "whitespace-pre-wrap transition-colors duration-150", 
                        log.includes('🎉') ? "text-emerald-500 font-black py-1" : 
                        log.includes('• Combined') ? "text-amber-400 font-bold" : 
                        log.includes('• Added') ? "text-slate-300 font-medium" : 
                        log.includes('❌') ? "text-rose-500 font-black" : "text-slate-500"
                      )}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
      {subTab === 'preferences' && (
        <SettingsPage
          onNavigate={(tab) => onNavigateTab?.(tab)}
          onNotify={(msg, isError) => (isError ? onError?.(msg) : onSuccess?.(msg))}
        />
      )}

      {subTab === 'logs' && (
        <div className="animate-in fade-in duration-300">
          <SystemLogs />
        </div>
      )}

    </div>
  );
}
