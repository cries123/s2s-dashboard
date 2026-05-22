import React, { useState } from 'react';
import { X, Save, Plus, Trash2, Calculator, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';

interface UpsellItem {
  code: string;
  description: string;
  count: number;
  revenue: number;
}

interface AdvisorData {
  name: string;
  soCount: number;
  hrsSold: number;
  laborSold: number;
  grossLabor: number;
  partsSold: number;
  grossParts: number;
  totalSales: number;
  gpPercent: number;
  elr: number;
  upsells?: UpsellItem[];
}

interface ManualPerformanceEntryProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { advisors: AdvisorData[], totals?: any }) => void;
  initialAdvisors?: AdvisorData[];
}

export const ManualPerformanceEntry: React.FC<ManualPerformanceEntryProps> = ({ isOpen, onClose, onSave, initialAdvisors }) => {
  const [advisors, setAdvisors] = useState<Partial<AdvisorData>[]>([
    { name: '', soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, elr: 0, gpPercent: 0, upsells: [] }
  ]);

  React.useEffect(() => {
    if (isOpen) {
      if (initialAdvisors && initialAdvisors.length > 0) {
        setAdvisors(initialAdvisors);
      } else {
        setAdvisors([
          { name: '', soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, elr: 0, gpPercent: 0, upsells: [] }
        ]);
      }
    }
  }, [isOpen, initialAdvisors]);

  const handleAddAdvisor = () => {
    setAdvisors([...advisors, { name: '', soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, elr: 0, gpPercent: 0, upsells: [] }]);
  };

  const handleRemoveAdvisor = (index: number) => {
    setAdvisors(advisors.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: keyof AdvisorData, value: string | number) => {
    const updated = [...advisors];
    const numValue = (field !== 'name' && field !== 'upsells') ? Number(value) : value;
    updated[index] = { ...updated[index], [field]: numValue };
    
    // Auto-calculations
    const currentAdvisor = updated[index];
    const labor = Number(currentAdvisor.laborSold || 0);
    const parts = Number(currentAdvisor.partsSold || 0);
    const grossL = Number(currentAdvisor.grossLabor || 0);
    const hrs = Number(currentAdvisor.hrsSold || 0);

    if (field === 'laborSold' || field === 'partsSold') {
      updated[index].totalSales = labor + parts;
    }
    
    if (field === 'laborSold' || field === 'grossLabor') {
      updated[index].gpPercent = labor > 0 ? Math.round((grossL / labor) * 100) : 0;
    }
    
    if (field === 'laborSold' || field === 'hrsSold') {
      updated[index].elr = hrs > 0 ? Number((labor / hrs).toFixed(2)) : 0;
    }

    setAdvisors(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validAdvisors = advisors
      .filter(a => a.name && a.name.trim() !== '')
      .map(a => ({
        ...a,
        name: a.name!,
        soCount: Number(a.soCount || 0),
        hrsSold: Number(a.hrsSold || 0),
        laborSold: Number(a.laborSold || 0),
        grossLabor: Number(a.grossLabor || 0),
        partsSold: Number(a.partsSold || 0),
        grossParts: Number(a.grossParts || 0),
        totalSales: Number(a.totalSales || 0),
        gpPercent: Number(a.gpPercent || 0),
        elr: Number(a.elr || 0),
        upsells: a.upsells || []
      })) as AdvisorData[];

    if (validAdvisors.length === 0) return;

    // Calculate totals
    const totals = {
      totalLabor: validAdvisors.reduce((a, b) => a + b.laborSold, 0),
      totalGross: validAdvisors.reduce((a, b) => a + b.grossLabor, 0),
      totalParts: validAdvisors.reduce((a, b) => a + b.partsSold, 0),
      totalGrossParts: validAdvisors.reduce((a, b) => a + b.grossParts, 0),
      totalSales: validAdvisors.reduce((a, b) => a + b.totalSales, 0),
      totalHrs: validAdvisors.reduce((a, b) => a + b.hrsSold, 0),
    };

    onSave({ advisors: validAdvisors, totals });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 lg:p-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-6xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary border border-brand-primary/20">
                <Users size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">Manual Productivity <span className="text-brand-primary">Input</span></h2>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Direct data entry for advisor performance metrics</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-3 hover:bg-white/5 rounded-2xl transition-colors text-slate-500 hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <form id="manual-entry-form" onSubmit={handleSubmit} className="space-y-6">
              {advisors.map((advisor, index) => (
                <div key={index} className="p-6 bg-slate-950/50 border border-slate-800 rounded-3xl relative group">
                  <div className="absolute -top-3 left-6 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[9px] font-black text-brand-primary uppercase tracking-widest">
                    Advisor #{index + 1}
                  </div>
                  
                  {advisors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAdvisor(index)}
                      className="absolute top-4 right-4 p-2 hover:bg-rose-500/10 text-slate-600 hover:text-rose-500 rounded-xl transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6 mt-2">
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Advisor Name</label>
                      <input
                        type="text"
                        required
                        value={advisor.name}
                        onChange={(e) => handleChange(index, 'name', e.target.value)}
                        placeholder="John Doe"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder:text-slate-700 focus:border-brand-primary/50 transition-colors"
                      />
                    </div>
                    
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">SO Count</label>
                      <input
                        type="number"
                        value={advisor.soCount}
                        onChange={(e) => handleChange(index, 'soCount', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-brand-primary/50 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Hours Sold</label>
                      <input
                        type="number"
                        step="0.1"
                        value={advisor.hrsSold}
                        onChange={(e) => handleChange(index, 'hrsSold', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-brand-primary/50 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Labor Sales ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={advisor.laborSold}
                        onChange={(e) => handleChange(index, 'laborSold', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-brand-primary/50 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Gross Labor ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={advisor.grossLabor}
                        onChange={(e) => handleChange(index, 'grossLabor', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-brand-primary/50 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Part Sales ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={advisor.partsSold}
                        onChange={(e) => handleChange(index, 'partsSold', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-brand-primary/50 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Gross Parts ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={advisor.grossParts}
                        onChange={(e) => handleChange(index, 'grossParts', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-brand-primary/50 transition-colors"
                      />
                    </div>

                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex flex-col justify-center">
                       <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">Total Sales</p>
                       <p className="text-sm font-black text-white">${advisor.totalSales?.toLocaleString()}</p>
                    </div>

                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex flex-col justify-center">
                       <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">E.L.R.</p>
                       <p className="text-sm font-black text-brand-secondary">${advisor.elr}</p>
                    </div>

                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex flex-col justify-center">
                       <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">Labor GP%</p>
                       <p className="text-sm font-black text-emerald-500">{advisor.gpPercent}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </form>
            
            <button
              type="button"
              onClick={handleAddAdvisor}
              className="w-full py-4 border-2 border-dashed border-slate-800 rounded-3xl text-slate-500 hover:text-brand-primary hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Add Another Advisor Record
            </button>
          </div>

          {/* Footer */}
          <div className="p-8 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
            <div className="flex items-center gap-4 text-slate-500">
               <Calculator size={16} />
               <p className="text-[9px] font-bold uppercase tracking-widest italic">Calculated metrics will be updated in realtime upon saving</p>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={onClose}
                className="px-8 py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                form="manual-entry-form"
                type="submit"
                className="px-8 py-4 bg-brand-primary text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <Save size={16} />
                Save Productivity Data
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
