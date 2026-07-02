import React, { useMemo, useState } from 'react';
import { buildArchiveDestinationOptions } from '../../../lib/operationsViewPeriod';
import { getPreviousArchiveMonthKey } from '../../../lib/operationsPayTypes';

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
  const archiveOptions = useMemo(() => buildArchiveDestinationOptions(), []);
  const [selectedPeriod, setSelectedPeriod] = useState(() => getPreviousArchiveMonthKey());

  const handleCommitArchive = () => {
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
          <h3 className="text-base font-semibold text-white">
            Close out month
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Save current performance numbers to an archive month, then start fresh for the new month.
          </p>
        </div>

        <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-800">
          <label className="input-label">
            Archive to
          </label>
          <select 
            value={selectedPeriod} 
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="input-field text-sm"
          >
            {archiveOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border p-3 text-sm space-y-1" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex justify-between">
            <span className="text-slate-400">Total throughput</span>
            <span className="font-medium text-white tabular-nums">{currentData?.totalThroughput || '$0.00'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Labor gross MTD</span>
            <span className="font-medium text-emerald-400 tabular-nums">{currentData?.laborGross || '$0.00'}</span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleCommitArchive} className="flex-1 btn-primary">
            Archive & reset
          </button>
        </div>

      </div>
    </div>
  );
}
