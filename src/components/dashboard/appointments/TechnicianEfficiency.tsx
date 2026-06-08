import React, { useState, useEffect, useRef } from 'react';
import { 
  doc, setDoc, onSnapshot, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { User } from '../../../types';
import { extractTextFromPDF } from '../../../utils/pdfExtractor';
import { withDmsProvider } from '../../../lib/reportIngestion';
import type { DmsProviderId } from '../../../constants/dmsProviders';
import { DEFAULT_DMS_PROVIDER, normalizeDmsProvider } from '../../../constants/dmsProviders';
import { 
  FileUp, Clock, User as UserIcon, Gauge, Plus, Trash2, Loader2, 
  CheckCircle2, TrendingUp, UserPlus, Edit2, Save, RotateCcw, Sparkles 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { EmptyState } from '../../ui/EmptyState';

interface TechnicianData {
  techName: string;
  clockedHours: number;
  flaggedHours: number;
  efficiency: number; // percentage
}

interface TechnicianEfficiencyProps {
  currentUser: User;
  currentDealershipId: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
  selectedMonth?: string;
  allowArchiveEditing?: boolean;
}

export const TechnicianEfficiency: React.FC<TechnicianEfficiencyProps> = ({
  currentUser,
  currentDealershipId,
  onSuccess,
  onError,
  selectedMonth = 'active',
  allowArchiveEditing = false
}) => {
  const [technicians, setTechnicians] = useState<TechnicianData[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [dmsProvider, setDmsProvider] = useState<DmsProviderId>(DEFAULT_DMS_PROVIDER);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingTechIndex, setEditingTechIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TechnicianData | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // New manual tech entry form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTechForm, setNewTechForm] = useState({
    techName: '',
    clockedHours: '',
    flaggedHours: ''
  });

  const [reportStartDate, setReportStartDate] = useState("2026-05-16");
  const [reportEndDate, setReportEndDate] = useState("2026-05-28");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Detect date range from raw text
  const detectDateRangeFromText = (text: string): { start: string; end: string } | null => {
    if (!text) return null;
    const regexSlashRange = /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-\u2013\u2014to]+\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/;
    const slashMatch = text.match(regexSlashRange);
    if (slashMatch) {
      const parseFlexibleStr = (str: string): string => {
        const parts = str.split('/');
        let m = parseInt(parts[0], 10);
        let d = parseInt(parts[1], 10);
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        const mm = m < 10 ? `0${m}` : `${m}`;
        const dd = d < 10 ? `0${d}` : `${d}`;
        return `${y}-${mm}-${dd}`;
      };
      try {
        return {
          start: parseFlexibleStr(slashMatch[1]),
          end: parseFlexibleStr(slashMatch[2])
        };
      } catch (e) {
        console.warn("Slash range format parsed with error:", e);
      }
    }

    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const regexWordRange = /([a-zA-Z]+)\s+(\d{1,2})\s*,\s*(\d{4})\s*[-\u2013\u2014to]+\s*([a-zA-Z]+)\s+(\d{1,2})\s*,\s*(\d{4})/;
    const wordMatch = text.match(regexWordRange);
    if (wordMatch) {
      try {
        const getMonthIndex = (word: string): number => {
          const needle = word.toLowerCase().slice(0, 3);
          const idx = months.indexOf(needle);
          return idx !== -1 ? idx : 0;
        };
        const startM = getMonthIndex(wordMatch[1]) + 1;
        const startD = parseInt(wordMatch[2], 10);
        const startY = parseInt(wordMatch[3], 10);
        
        const endM = getMonthIndex(wordMatch[4]) + 1;
        const endD = parseInt(wordMatch[5], 10);
        const endY = parseInt(wordMatch[6], 10);

        const mmStart = startM < 10 ? `0${startM}` : `${startM}`;
        const ddStart = startD < 10 ? `0${startD}` : `${startD}`;
        const mmEnd = endM < 10 ? `0${endM}` : `${endM}`;
        const ddEnd = endD < 10 ? `0${endD}` : `${endD}`;

        return {
          start: `${startY}-${mmStart}-${ddStart}`,
          end: `${endY}-${mmEnd}-${ddEnd}`
        };
      } catch (e) {
        console.warn("Word range format parsed with error:", e);
      }
    }
    return null;
  };

  // Helper: Format date string for humans
  const formatDateRangeShort = (startStr: string, endStr: string): string => {
    try {
      const start = new Date(startStr + 'T00:00:00');
      const end = new Date(endStr + 'T00:00:00');
      const fmt = (d: Date) => {
        const m = d.getMonth() + 1;
        const day = d.getDate();
        const yr = d.getFullYear().toString().substring(2);
        return `${m}/${day}/${yr}`;
      };
      return `${fmt(start)}-${fmt(end)}`;
    } catch (e) {
      return `${startStr} - ${endStr}`;
    }
  };

  // Real-time Firestore sync

  useEffect(() => {
    if (!currentDealershipId) return;
    const settingsRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings', currentDealershipId);
    return onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        setDmsProvider(normalizeDmsProvider(snap.data().dmsProvider as string));
      }
    });
  }, [currentDealershipId]);

  useEffect(() => {
    if (!currentDealershipId) return;

    const baseId = currentDealershipId === 'hyundai' ? 'technicianReports' : `technicianReports_${currentDealershipId}`;
    const docId = selectedMonth === 'active' ? baseId : `${baseId}_archive_${selectedMonth}`;
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.technicians) {
          setTechnicians(data.technicians);
        } else {
          setTechnicians([]);
        }
        if (data.reportStartDate) {
          setReportStartDate(data.reportStartDate);
        }
        if (data.reportEndDate) {
          setReportEndDate(data.reportEndDate);
        }
      } else {
        setTechnicians([]);
      }
      setLoading(false);
    }, (err) => {
      console.error("[TechnicianEfficiency] Sync error:", err);
      onError?.("Failed to sync technician efficiency data.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentDealershipId, onError, selectedMonth]);

  // Save changes back to Firestore helper
  const saveToFirestore = async (updatedTechs: TechnicianData[], CustomStart?: string, CustomEnd?: string, targetMonthOverride?: string) => {
    try {
      const targetMonth = targetMonthOverride || selectedMonth;
      const baseId = currentDealershipId === 'hyundai' ? 'technicianReports' : `technicianReports_${currentDealershipId}`;
      const docId = targetMonth === 'active' ? baseId : `${baseId}_archive_${targetMonth}`;
      const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
      
      const newStart = CustomStart || reportStartDate;
      const newEnd = CustomEnd || reportEndDate;

      await setDoc(docRef, {
        technicians: updatedTechs,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.username || currentUser.email,
        reportStartDate: newStart,
        reportEndDate: newEnd
      }, { merge: true });

    } catch (err: any) {
      console.error("[TechnicianEfficiency] Error saving:", err);
      onError?.("Database error: Could not save records.");
    }
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      onError?.("Please upload a valid PDF document.");
      return;
    }

    setParsing(true);
    try {
      // 1. Client-side extract text
      const extractedText = await extractTextFromPDF(file);
      const pdfBase64 = await fileToBase64(file);

      // 2. Call our robust server endpoint
      const response = await fetch('/api/parse-technician-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withDmsProvider({ dmsProvider }, { pdfBase64, reportText: extractedText }))
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Failed to parse technician performance report.");
      }

      const parsedTechs: TechnicianData[] = resData.data.technicians || [];
      
      if (parsedTechs.length === 0) {
        onError?.("No technician rows found. Try keying technician data manually.");
        setParsing(false);
        return;
      }

      // Merge new techs with existing records or overwrite
      const mergedTechs = [...technicians];
      parsedTechs.forEach(newTech => {
        const idx = mergedTechs.findIndex(t => t.techName.toLowerCase().trim() === newTech.techName.toLowerCase().trim());
        if (idx !== -1) {
          mergedTechs[idx] = newTech;
        } else {
          mergedTechs.push(newTech);
        }
      });

      // Detect date range from PDF text
      const detectedDates = detectDateRangeFromText(extractedText);
      let loadedStart = reportStartDate;
      let loadedEnd = reportEndDate;
      let targetMonth = selectedMonth;

      if (detectedDates) {
        loadedStart = detectedDates.start;
        loadedEnd = detectedDates.end;
        setReportStartDate(detectedDates.start);
        setReportEndDate(detectedDates.end);

        // Auto-route to May archive if dates fall in May
        if (detectedDates.start.startsWith('2026-05')) {
          targetMonth = '2026-05';
        }
      }

      await saveToFirestore(mergedTechs, loadedStart, loadedEnd, targetMonth);
      if (targetMonth === '2026-05' && selectedMonth === 'active') {
        onSuccess?.(`Detected May dates! Saved ${parsedTechs.length} technicians directly to May 2026 Saved Archive. June active tracker kept clean.`);
      } else {
        onSuccess?.(`Successfully imported & merged ${parsedTechs.length} technicians.`);
      }
      setParsing(false);

    } catch (err: any) {
      console.error("[TechnicianEfficiency] Upload error:", err);
      onError?.(err?.message || "Parsing failed. Defaulting to manual data entry is supported.");
      setParsing(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  // Add standard manual technician handler
  const handleAddNewTech = async (e: React.FormEvent) => {
    e.preventDefault();
    const { techName, clockedHours, flaggedHours } = newTechForm;

    if (!techName.trim()) {
      onError?.("Technician Name is required.");
      return;
    }

    const clockVal = parseFloat(clockedHours);
    const flagVal = parseFloat(flaggedHours);

    if (isNaN(clockVal) || clockVal <= 0) {
      onError?.("Please enter valid positive Clocked Hours.");
      return;
    }

    if (isNaN(flagVal) || flagVal < 0) {
      onError?.("Please enter positive Flagged Hours.");
      return;
    }

    const efficiency = Math.round((flagVal / clockVal) * 100);

    const newRecord: TechnicianData = {
      techName: techName.trim(),
      clockedHours: clockVal,
      flaggedHours: flagVal,
      efficiency
    };

    const updated = [...technicians];
    const idx = updated.findIndex(t => t.techName.toLowerCase().trim() === newRecord.techName.toLowerCase().trim());
    if (idx !== -1) {
      updated[idx] = newRecord;
    } else {
      updated.push(newRecord);
    }

    await saveToFirestore(updated);
    onSuccess?.(`Technician ${techName} registered successfully.`);
    setNewTechForm({ techName: '', clockedHours: '', flaggedHours: '' });
    setShowAddForm(false);
  };

  // Delete technician handler
  const handleDeleteTech = async (index: number) => {
    const backup = [...technicians];
    const removedName = backup[index].techName;
    backup.splice(index, 1);
    await saveToFirestore(backup);
    onSuccess?.(`Removed ${removedName} from performance index.`);
  };

  // Clear tracking list
  const handleResetTracks = async () => {
    await saveToFirestore([]);
    onSuccess?.("Cleared technician efficiency logs.");
    setShowResetConfirm(false);
  };

  const startEditing = (idx: number) => {
    setEditingTechIndex(idx);
    setEditForm({ ...technicians[idx] });
  };

  const saveInlineEdit = async () => {
    if (editingTechIndex === null || !editForm) return;

    if (editForm.clockedHours <= 0) {
      onError?.("Clocked hours must exceed zero.");
      return;
    }

    const calculatedEfficiency = Math.round((editForm.flaggedHours / editForm.clockedHours) * 100);
    const updatedRecord = {
      ...editForm,
      efficiency: calculatedEfficiency
    };

    const updated = [...technicians];
    updated[editingTechIndex] = updatedRecord;

    await saveToFirestore(updated);
    onSuccess?.(`Updated performance figures for ${editForm.techName}.`);
    setEditingTechIndex(null);
    setEditForm(null);
  };

  const averageEfficiency = technicians.length > 0
    ? Math.round((technicians.reduce((sum, t) => sum + t.flaggedHours, 0) / Math.max(1, technicians.reduce((sum, t) => sum + t.clockedHours, 0))) * 100)
    : 0;

  return (
    <div className="bg-slate-950/40 border border-white/5 backdrop-blur-xl p-8 rounded-3xl relative shadow-2xl overflow-hidden group/box">
      {/* Dynamic Ambient Background Spark */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-[80px] pointer-events-none group-hover/box:bg-brand-primary/10 transition-all duration-500" />
      
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 relative z-10 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
            <Gauge size={22} className="text-brand-primary animate-pulse" />
          </div>
          <div>
            <span className="text-[9px] font-black text-brand-primary uppercase tracking-widest block mb-0.5">Real-time Performance Metrics</span>
            <h2 className="text-xl font-black text-white tracking-wider uppercase">Technician Efficiency Tracker</h2>
            {reportStartDate && reportEndDate && (
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                Active Report Period: {formatDateRangeShort(reportStartDate, reportEndDate)}
              </p>
            )}
          </div>
        </div>

        {selectedMonth !== 'active' && !allowArchiveEditing ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-white/5 rounded-xl shadow-lg">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
              🔒 VIEWING HISTORY ARCHIVE ({selectedMonth === '2026-05' ? 'MAY 2026' : selectedMonth === '2026-04' ? 'APRIL 2026' : selectedMonth.toUpperCase()} - READ ONLY)
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {selectedMonth !== 'active' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse">
                <span>⚠️ ARCHIVE EDIT MODE ({selectedMonth})</span>
              </div>
            )}
            <button
              onClick={() => setShowAddForm(prev => !prev)}
              className="h-10 px-4 flex items-center gap-2 bg-white/5 hover:bg-white/10 active:scale-95 text-white border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
            >
              <UserPlus size={14} className="text-brand-primary" />
              {showAddForm ? "Hide Form" : "Add Technician"}
            </button>
            
            {technicians.length > 0 && (
              <div className="relative flex items-center">
                {showResetConfirm ? (
                  <div className="flex items-center gap-2 bg-rose-950/20 border border-rose-500/30 p-1 rounded-xl">
                    <span className="text-[9px] text-rose-400 font-bold uppercase px-2">Clear all?</span>
                    <button
                      onClick={handleResetTracks}
                      className="h-8 px-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="h-8 px-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="h-10 px-4 flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/15 text-rose-400 border border-rose-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Add Form Trigger */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            onSubmit={handleAddNewTech}
            className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 mb-8 relative z-10 overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Technician Name *</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    required
                    placeholder="Enter full name"
                    value={newTechForm.techName}
                    onChange={e => setNewTechForm({ ...newTechForm, techName: e.target.value })}
                    className="w-full h-11 bg-slate-900 border border-white/10 hover:border-white/20 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary rounded-xl pl-11 pr-4 text-xs font-semibold text-white outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Clocked Hours *</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="e.g. 40.0"
                    value={newTechForm.clockedHours}
                    onChange={e => setNewTechForm({ ...newTechForm, clockedHours: e.target.value })}
                    className="w-full h-11 bg-slate-900 border border-white/10 hover:border-white/20 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary rounded-xl pl-11 pr-4 text-xs font-semibold text-white outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Flagged (Flat Rate) Hours *</label>
                <div className="relative">
                  <Gauge className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="e.g. 52.5"
                    value={newTechForm.flaggedHours}
                    onChange={e => setNewTechForm({ ...newTechForm, flaggedHours: e.target.value })}
                    className="w-full h-11 bg-slate-900 border border-white/10 hover:border-white/20 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary rounded-xl pl-11 pr-4 text-xs font-semibold text-white outline-none transition-all shadow-inner"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-[10px] uppercase font-black tracking-widest text-slate-400 hover:text-white transition-colors"
                id="tech-add-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-brand-primary hover:brightness-110 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-brand-primary/15"
                id="tech-add-submit-btn"
              >
                Register Technician
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start relative z-10">
        {/* DRAG-AND-DROP FILE UPLOADER */}
        {(selectedMonth === 'active' || allowArchiveEditing) && (
          <div className="col-span-1 xl:col-span-1">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              "border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all min-h-[300px] cursor-pointer",
              isDragOver 
                ? "border-brand-primary bg-brand-primary/10 scale-[1.01]" 
                : "border-white/10 hover:border-white/25 bg-white/[0.01] hover:bg-white/[0.03]"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".pdf" 
              className="hidden" 
            />
            
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center text-slate-400 mb-6 transition-all shadow-lg shadow-black/45 hover:scale-105">
              {parsing ? (
                <div className="relative">
                  <Loader2 className="animate-spin text-brand-primary" size={28} />
                  <Sparkles className="absolute -top-1 -right-1 text-emerald-400 animate-bounce" size={12} />
                </div>
              ) : (
                <FileUp size={24} className="text-brand-primary" />
              )}
            </div>

            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2">Import Technician Summary PDF</h3>
            <p className="text-[10px] text-slate-500 max-w-[220px] font-medium leading-relaxed mb-6">
              Drag-and-drop your DMS technician efficiency report here or <span className="text-brand-primary font-black underline">click to browse</span>.
            </p>

            <div className="py-1 px-3 rounded-lg bg-white/5 border border-white/5 inline-flex items-center gap-1.5 shadow-sm">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping"></div>
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Supports PDF Upload</span>
            </div>
          </div>

          {/* Quick Average Widget if techs logged */}
          {technicians.length > 0 && (
            <div className="mt-6 bg-[#0c1224] border border-white/5 p-6 rounded-2xl flex items-center gap-5 shadow-inner">
              <div className={cn(
                "w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-md",
                averageEfficiency >= 100 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : averageEfficiency >= 80
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-400"
              )}>
                <TrendingUp size={20} />
              </div>
              <div>
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">Overall Shop Tech Efficiency</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-white leading-none tracking-tight">{averageEfficiency}%</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Avg ({technicians.length} Techs)</span>
                </div>
              </div>
            </div>
          )}
          </div>
        )}

        {/* PERFORMANCE LIST SECTION */}
        <div className={cn(
          "col-span-1 xl:col-span-2 space-y-4",
          (selectedMonth !== 'active' && !allowArchiveEditing) && "xl:col-span-3 col-span-full"
        )}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="animate-spin text-brand-primary mb-3" size={28} />
              <p className="text-xs uppercase font-black tracking-widest">Synchronizing Performance Tables...</p>
            </div>
          ) : technicians.length === 0 ? (
            <EmptyState
              title="No technician data yet"
              description='Upload a technician summary PDF or use "Add technician" to start tracking flagged hours and efficiency.'
            />
          ) : (
            <div className="bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden shadow-inner">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" id="technicians-efficiency-table">
                  <thead>
                    <tr className="border-b border-white/5 bg-slate-950/20 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-6 py-4">Technician</th>
                      <th className="px-6 py-4 text-center">Clocked Hrs</th>
                      <th className="px-6 py-4 text-center">Flagged Hrs</th>
                      <th className="px-6 py-4">Efficiency</th>
                      {(selectedMonth === 'active' || allowArchiveEditing) && <th className="px-6 py-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {technicians.map((tech, index) => {
                      const isEditing = editingTechIndex === index;
                      const avatarLetters = tech.techName.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || "T";
                      
                      const performanceColor = tech.efficiency >= 80 
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/10" 
                        : "text-rose-500 bg-rose-500/10 border-rose-500/20";
                      
                      const progressBarColor = tech.efficiency >= 80 
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400" 
                        : "bg-gradient-to-r from-rose-600 to-rose-550";

                      return (
                        <tr key={index} className="hover:bg-white/[0.02] transition-colors group/row text-xs font-semibold text-slate-300">
                          {/* TECH NAME */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black uppercase shadow-sm shrink-0 border",
                                tech.efficiency >= 80 
                                  ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/10" 
                                  : "bg-rose-500/5 text-rose-550 border-rose-500/20"
                              )}>
                                {avatarLetters}
                              </div>
                              <span className="text-white font-bold max-w-[130px] truncate">{tech.techName}</span>
                            </div>
                          </td>

                          {/* CLOCKED HOURS */}
                          <td className="px-6 py-4 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.1"
                                value={editForm?.clockedHours ?? 0}
                                onChange={e => setEditForm(prev => prev ? { ...prev, clockedHours: parseFloat(e.target.value) || 0 } : null)}
                                className="w-20 text-center h-8 bg-slate-950 border border-white/10 rounded-lg text-xs font-semibold text-white outline-none"
                              />
                            ) : (
                              <span className="font-mono text-slate-450">{tech.clockedHours.toFixed(1)}</span>
                            )}
                          </td>

                          {/* FLAGGED HOURS */}
                          <td className="px-6 py-4 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.1"
                                value={editForm?.flaggedHours ?? 0}
                                onChange={e => setEditForm(prev => prev ? { ...prev, flaggedHours: parseFloat(e.target.value) || 0 } : null)}
                                className="w-20 text-center h-8 bg-slate-950 border border-white/10 rounded-lg text-xs font-semibold text-white outline-none"
                              />
                            ) : (
                              <span className="font-mono text-emerald-500 font-bold">{tech.flaggedHours.toFixed(1)}</span>
                            )}
                          </td>

                          {/* EFFICIENCY BAR & PERCENTAGE */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4 min-w-[220px]">
                              <span className={cn("px-2 py-1 rounded-lg text-[10px] font-mono font-black border text-center min-w-[54px] shadow-sm", performanceColor)}>
                                {tech.efficiency}%
                              </span>
                              <span className={cn(
                                "inline-flex px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border whitespace-nowrap",
                                tech.efficiency >= 80
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-500 border-rose-500/20 text-rose-500 font-bold animate-pulse"
                              )}>
                                {tech.efficiency >= 80 ? 'Above Standard' : 'Below Standard'}
                              </span>
                              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden hidden sm:block">
                                <div 
                                  className={cn("h-full rounded-full transition-all duration-500", progressBarColor)} 
                                  style={{ width: `${Math.min(100, tech.efficiency)}%` }} 
                                />
                              </div>
                            </div>
                          </td>

                          {/* INLINE ACTIONS */}
                          {(selectedMonth === 'active' || allowArchiveEditing) ? (
                            <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2.5">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={saveInlineEdit}
                                    className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded border border-emerald-500/20 transition-all cursor-pointer"
                                    title="Save changes"
                                  >
                                    <CheckCircle2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingTechIndex(null);
                                      setEditForm(null);
                                    }}
                                    className="p-1 text-rose-400 hover:bg-rose-500/10 rounded border border-rose-500/20 transition-all cursor-pointer"
                                    title="Cancel"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEditing(index)}
                                    className="p-1.5 text-slate-450 hover:text-white rounded hover:bg-white/5 transition-all cursor-pointer"
                                    title="Edit measurements"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTech(index)}
                                    className="p-1.5 text-slate-455 hover:text-rose-400 rounded hover:bg-rose-500/10 transition-all cursor-pointer"
                                    title="Remove technician"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
