import React, { useState } from 'react';

export interface ArchiveControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentData: {
    totalThroughput?: string;
    laborGross?: string;
    rawValues?: {
      laborSales: number;
      laborGross: number;
      partsSales: number;
      partsGross: number;
      advisorBreakdown: any[];
      techBreakdown: any[];
    };
  };
  onConfirmArchive: (payload: {
    targetYearMonth: string;
    metricsSnapshot: {
      laborSales: number;
      laborGross: number;
      partsSales: number;
      partsGross: number;
      advisorBreakdown: any[];
      techBreakdown: any[];
    };
  }) => void;
}

export function ArchiveControlModal({ isOpen, onClose, currentData, onConfirmArchive }: ArchiveControlModalProps) {
  // Default to previous month since closing reports are always uploaded a day or two late
  const [selectedPeriod, setSelectedPeriod] = useState('2026-05'); 

  const handleCommitArchive = () => {
    // Send data to backend with explicit period routing instructions
    const snapshot = currentData.rawValues || {
      laborSales: 0,
      laborGross: 0,
      partsSales: 0,
      partsGross: 0,
      advisorBreakdown: [],
      techBreakdown: []
    };

    onConfirmArchive({
      targetYearMonth: selectedPeriod,
      metricsSnapshot: snapshot
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
        
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">
            ⚠️ Confirm Historical Metric Archive
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Specify the destination calendar month for these performance numbers to ensure accurate audit reporting.
          </p>
        </div>

        {/* DATE SELECT PICKER INPUT */}
        <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-800">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
            Target Archive Period
          </label>
          <select 
            value={selectedPeriod} 
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="2026-04">April 2026</option>
            <option value="2026-05">May 2026 (Last Month Closeout)</option>
            <option value="2026-06">June 2026 (Current Active Month)</option>
          </select>
        </div>

        {/* DATA SUMMARY REVIEW */}
        <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/60 text-xs font-mono space-y-1 text-slate-400">
          <div className="flex justify-between">
            <span>TOTAL THROUGHPUT:</span> 
            <span className="text-white font-bold">{currentData?.totalThroughput || "$0.00"}</span>
          </div>
          <div className="flex justify-between">
            <span>LABOR GROSS (MTD):</span> 
            <span className="text-emerald-400 font-bold">{currentData?.laborGross || "$0.00"}</span>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-2 pt-2">
          <button 
            onClick={onClose}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-2.5 rounded-xl uppercase transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleCommitArchive}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 rounded-xl uppercase tracking-wider transition-all shadow-lg shadow-indigo-950/40"
          >
            Confirm & Push to Archive
          </button>
        </div>

      </div>
    </div>
  );
}
