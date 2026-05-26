import React, { useState, useEffect } from 'react';
import { 
  X, Save, Edit2, Trash2, User as UserIcon, Phone, Mail, MapPin, Car, Calendar, Gauge, History, Database, Wrench, Droplet, Activity
} from 'lucide-react';
import { doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Customer, User } from '../../types';

interface ProfileModalProps {
  customer: Customer;
  onClose: () => void;
  onDelete: (id: string, name: string) => void;
}

export default function ProfileModal({ customer, onClose, onDelete }: ProfileModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ ...customer });

  useEffect(() => {
    setFormData({ ...customer });
  }, [customer]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const calculateOilChangeInterval = () => {
    const visits = customer.recentVisits || [];
    if (visits.length === 0) return null;

    const isOilChangeText = (text: string) => {
      if (!text) return false;
      const lower = text.toLowerCase();
      return (
        lower.includes("oil change") ||
        lower.includes("oil & filter") ||
        lower.includes("oil/filter") ||
        lower.includes(" lof") ||
        lower.startsWith("lof ") ||
        lower === "lof" ||
        lower.includes("lube, oil") ||
        lower.includes("lube oil") ||
        lower.includes("synthetic oil") ||
        lower.includes("engine oil") ||
        lower.includes("0w-20") ||
        lower.includes("5w-20") ||
        lower.includes("5w-30")
      );
    };

    const oilVisits = [...visits]
      .filter(v => isOilChangeText(v.requests))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (oilVisits.length === 0) {
      return {
        hasData: false,
        message: "No recorded oil changes found in service history."
      };
    }

    if (oilVisits.length === 1) {
      return {
        hasData: false,
        count: 1,
        lastDate: oilVisits[0].date,
        lastMileage: oilVisits[0].mileage,
        message: "Only 1 oil change recorded. (Need at least 2 visits to compute average interval)"
      };
    }

    let totalDays = 0;
    let totalMiles = 0;
    let calculationCount = 0;

    for (let i = 1; i < oilVisits.length; i++) {
      const prev = oilVisits[i - 1];
      const curr = oilVisits[i];

      const prevTime = new Date(prev.date).getTime();
      const currTime = new Date(curr.date).getTime();

      if (!isNaN(prevTime) && !isNaN(currTime)) {
        const daysDiff = (currTime - prevTime) / (1000 * 60 * 60 * 24);
        if (daysDiff > 0) {
          totalDays += daysDiff;
          totalMiles += Math.abs(curr.mileage - prev.mileage);
          calculationCount++;
        }
      }
    }

    if (calculationCount === 0) {
      return {
        hasData: false,
        count: oilVisits.length,
        lastDate: oilVisits[oilVisits.length - 1].date,
        lastMileage: oilVisits[oilVisits.length - 1].mileage,
        message: "Duplicate or invalid dates in oil change records."
      };
    }

    const avgDays = totalDays / calculationCount;
    const avgMiles = Math.round(totalMiles / calculationCount);
    const avgMonths = Number((avgDays / 30.4375).toFixed(1));

    const lastOilVisit = oilVisits[oilVisits.length - 1];
    const lastDateObj = new Date(lastOilVisit.date);
    
    let nextDateStr = "N/A";
    if (!isNaN(lastDateObj.getTime())) {
      const nextDateObj = new Date(lastDateObj.getTime() + avgDays * 24 * 60 * 60 * 1000);
      nextDateStr = nextDateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    }

    const nextMileage = lastOilVisit.mileage + avgMiles;

    return {
      hasData: true,
      count: oilVisits.length,
      avgDays: Math.round(avgDays),
      avgMonths,
      avgMiles,
      lastDate: lastOilVisit.date,
      lastMileage: lastOilVisit.mileage,
      nextDate: nextDateStr,
      nextMileage
    };
  };

  const oilAnalysis = calculateOilChangeInterval();

  const handleSave = async () => {
    try {
      const { id, ...updates } = formData;
      await updateDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', id), updates as any);
      setIsEditing(false);
      // Logic for refreshing is usually handled by the real-time hook in parent
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content !max-w-5xl">
        <div className="p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-surface-border bg-slate-900/50">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-3xl font-extrabold text-white tracking-tight">
                {formData.firstName} {formData.lastName}
              </h3>
              {!isEditing ? (
                <span className="badge badge-info mt-1">Active Account</span>
              ) : (
                <span className="badge badge-warning mt-1 animate-pulse">Editing Mode</span>
              )}
            </div>
            <p className="text-sm text-slate-400 font-medium flex items-center gap-2">
              <History size={14} className="text-brand-primary" />
              Member since {new Date(customer.createdAt.toMillis()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="btn-secondary flex-1 md:flex-none py-2 px-6"
              >
                <Edit2 size={16} /> Edit Profile
              </button>
            ) : (
              <button 
                onClick={handleSave}
                className="btn-primary flex-1 md:flex-none py-2 px-6"
              >
                <Save size={16} /> Save Changes
              </button>
            )}
            <button 
              onClick={() => onDelete(customer.id, `${customer.firstName} ${customer.lastName}`)}
              className="p-2.5 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
              title="Delete Customer"
            >
              <Trash2 size={20} />
            </button>
            <button 
              onClick={onClose} 
              className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all ml-2"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left Column: Contact & Metadata */}
            <div className="space-y-10">
              <section>
                <h4 className="input-label mb-6 flex items-center gap-2 text-slate-100">
                  <Phone size={16} className="text-brand-primary" /> 
                  Contact Integration
                </h4>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="input-label !mb-0">First Name</label>
                      <input name="firstName" value={formData.firstName} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="input-label !mb-0">Last Name</label>
                      <input name="lastName" value={formData.lastName} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="input-label !mb-0">Mobile Phone</label>
                    <input name="phone" type="tel" value={formData.phone} onChange={handleChange} disabled={!isEditing} className="input-field" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="input-label !mb-0">Email Communication</label>
                    <input name="email" type="email" value={formData.email} onChange={handleChange} disabled={!isEditing} className="input-field" />
                  </div>
                </div>
              </section>

              <section>
                <h4 className="input-label mb-6 flex items-center gap-2 text-slate-100">
                  <MapPin size={16} className="text-brand-primary" /> 
                  Location Detail
                </h4>
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="input-label !mb-0">Street Address</label>
                    <input name="address" value={formData.address || ''} onChange={handleChange} disabled={!isEditing} className="input-field" placeholder="123 Dealer Ave" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="input-label !mb-0">City</label>
                      <input name="city" value={formData.city || ''} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="input-label !mb-0">State</label>
                      <input name="state" value={formData.state || ''} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="input-label !mb-0">ZIP</label>
                      <input name="zip" value={formData.zip || ''} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Vehicle & Records */}
            <div className="space-y-10">
              <section>
                <h4 className="input-label mb-6 flex items-center gap-2 text-slate-100">
                  <Car size={16} className="text-brand-primary" /> 
                  Premium Asset Identity
                </h4>
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1 space-y-1.5">
                      <label className="input-label !mb-0">Year</label>
                      <input name="year" value={formData.year || ''} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                    <div className="col-span-1 space-y-1.5">
                      <label className="input-label !mb-0">Make</label>
                      <input name="make" value={formData.make} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                    <div className="col-span-1 space-y-1.5">
                      <label className="input-label !mb-0">Model</label>
                      <input name="model" value={formData.model} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="input-label !mb-0">VIN (Last 8)</label>
                      <input name="vinLast8" value={formData.vinLast8} onChange={handleChange} disabled={!isEditing} className="input-field font-mono text-brand-secondary" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="input-label !mb-0">Current Mileage</label>
                      <div className="relative">
                        <input name="mileage" value={formData.mileage || ''} onChange={handleChange} disabled={!isEditing} className="input-field pr-12" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-600">MI</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="input-label !mb-0">Date of Delivery</label>
                      <input name="soldDate" type="date" value={formData.soldDate} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="input-label !mb-0">Language</label>
                      <input name="language" value={formData.language} onChange={handleChange} disabled={!isEditing} className="input-field" />
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
                <h4 className="input-label mb-6 flex items-center gap-2 text-slate-100">
                  <Calendar size={16} className="text-brand-primary" /> 
                  Lifecycle Tracking
                </h4>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Last Service Visit</p>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <History size={16} />
                      </div>
                      <p className="text-sm font-bold text-slate-200">{customer.lastServiceDate || 'No record'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Primary Advisor</p>
                    <p className="text-sm font-bold text-slate-200">{customer.soldByUsername || 'Direct Enrollment'}</p>
                  </div>
                </div>
              </section>

              <section className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
                <h4 className="input-label mb-6 flex items-center gap-2 text-slate-100 uppercase tracking-widest text-[11px] font-black">
                  <Droplet size={16} className="text-brand-secondary" /> 
                  Oil Change Interval Analysis
                </h4>
                
                {oilAnalysis ? (
                  oilAnalysis.hasData ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-950/40 border border-white/5 rounded-xl">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg Calendar Interval</p>
                          <p className="text-sm font-black text-white">
                            {oilAnalysis.avgMonths} Months <span className="text-[10px] text-slate-500 font-medium">({oilAnalysis.avgDays} Days)</span>
                          </p>
                        </div>
                        <div className="p-3 bg-slate-950/40 border border-white/5 rounded-xl">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg Mileage Interval</p>
                          <p className="text-sm font-black text-white">
                            {oilAnalysis.avgMiles?.toLocaleString()} mi
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-brand-primary/5 border border-brand-primary/25 rounded-xl">
                        <p className="text-[9px] font-black text-brand-primary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <Activity size={10} /> Predictive Next Oil Change
                        </p>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-[9px] text-slate-500 uppercase font-bold block">Estimated Due Date</span>
                            <span className="font-extrabold text-white">{oilAnalysis.nextDate}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 uppercase font-bold block">Estimated Due Mileage</span>
                            <span className="font-extrabold text-white">{oilAnalysis.nextMileage?.toLocaleString()} mi</span>
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-[8px] text-slate-500 italic text-center">
                        Calculated from {oilAnalysis.count} historical oil change service {oilAnalysis.count === 1 ? 'record' : 'records'}.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-950/20 border border-dashed border-slate-800 rounded-xl text-center space-y-1">
                      <p className="text-xs font-bold text-slate-400">Unable to Calculate Frequency</p>
                      <p className="text-[9px] text-slate-500 font-medium leading-relaxed">
                        {oilAnalysis.message}
                      </p>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-slate-500 font-medium italic">No service history records found to parse.</p>
                )}
              </section>
            </div>

            {/* Service History - Full Width */}
            <div className="col-span-full pt-10 border-t border-white/5 space-y-8">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                    <Database size={20} className="text-brand-primary" />
                    Ultimate Database: Service Records
                  </h4>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Historical synchronization of all dealership visits</p>
                </div>
                <div className="bg-brand-primary/10 border border-brand-primary/20 px-4 py-2 rounded-xl">
                   <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Total Logs: {customer.recentVisits?.length || 0}</span>
                </div>
              </div>

              {!customer.recentVisits || customer.recentVisits.length === 0 ? (
                <div className="p-16 text-center border-2 border-dashed border-slate-800 rounded-[2.5rem] bg-slate-900/20">
                  <div className="w-16 h-16 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-600">
                    <History size={32} />
                  </div>
                  <h5 className="text-lg font-black text-slate-400 uppercase tracking-tight">No Historical Records</h5>
                  <p className="text-slate-600 mt-2 font-medium italic text-sm">Synchronize with the Ultimate Database to import service history.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customer.recentVisits.map((visit, idx) => (
                    <div key={idx} className="group bg-slate-950 p-6 rounded-3xl border border-white/5 hover:border-brand-primary/30 transition-all shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Wrench size={40} className="rotate-12" />
                      </div>
                      
                      <div className="flex justify-between items-start mb-4 relative z-10">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary text-[8px] font-black uppercase tracking-widest rounded border border-brand-primary/20">SO #{visit.soNumber}</span>
                            <span className="text-xs font-black text-white">{visit.date}</span>
                          </div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Advisor: {visit.advisor}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-white leading-none">{visit.mileage.toLocaleString()}</p>
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Recorded Mileage</p>
                        </div>
                      </div>

                      <div className="bg-slate-900/50 rounded-2xl p-4 border border-white/5 group-hover:bg-slate-900 transition-colors relative z-10">
                        <p className="text-[9px] font-black text-brand-secondary uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                           <History size={10} /> Scope of Work
                        </p>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all whitespace-pre-wrap">
                          {visit.requests}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="px-8 py-5 bg-slate-900/80 border-t border-surface-border flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-slate-600">
          <span>S2S Security: AES-256 Encrypted Profile</span>
          <span className="text-slate-500">Record ID: {customer.id.slice(0, 8)}...</span>
        </div>
      </div>
    </div>
  );
}
