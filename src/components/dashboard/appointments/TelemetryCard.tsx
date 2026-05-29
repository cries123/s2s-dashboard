import React from 'react';
import { DispatchRepairOrder } from '../../../types';

interface TelemetryCardProps {
  roData: DispatchRepairOrder;
}

export function TelemetryCard({ roData }: TelemetryCardProps) {
  // Check if it's an internal dealership vehicle
  const isInternalAsset = 
    (roData.accountName?.toLowerCase().includes("hyundai of santa maria") || 
     !!roData.isInternal || 
     roData.customerName?.toLowerCase().includes("hyundai of santa maria"));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4 text-slate-100">
      
      {/* 1. HEADER SECTION (DYNAMIC HIERARCHY) */}
      <div className="flex justify-between items-start">
        <div>
          {isInternalAsset ? (
            /* Internal Asset Top View */
            <>
              <span className="bg-amber-950/80 text-amber-400 border border-amber-900/50 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md block w-fit mb-1">
                Store Inventory / Recon
              </span>
              <h3 className="text-lg font-semibold tracking-tight text-white">
                {roData.year || ''} {roData.model || 'Internal Vehicle'}
              </h3>
            </>
          ) : (
            /* Retail Customer Top View */
            <>
              <h3 className="text-lg font-bold tracking-tight text-white uppercase">
                {roData.customerName || `RO #${roData.roNumber} Guest`}
              </h3>
              {(roData.year || roData.model) && (
                <p className="text-xs text-slate-400">{roData.year || ''} {roData.model || ''}</p>
              )}
            </>
          )}
        </div>
        
        {/* Core RO Identifier Badge */}
        <span className="bg-slate-800 text-slate-300 font-mono text-xs px-2 py-1 rounded border border-slate-700">
          RO #{roData.roNumber}
        </span>
      </div>

      {/* 2. CONTACT METADATA SECTION (ONLY RENDER FOR RETAIL GUESTS) */}
      {!isInternalAsset && (roData.phoneNumber || roData.customerName) && (
        <div className="text-xs text-slate-400 flex items-center gap-1.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
          <span className="text-slate-500">📞</span>
          <span>{roData.phoneNumber || 'No Phone Entry'}</span>
        </div>
      )}

      {/* 3. CORE TECHNICAL METADATA (VEHICLE SPECIFICS) */}
      <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
        <div className="bg-slate-950/30 p-2 rounded border border-slate-800/40">
          <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Identifiers</span>
          <span className="font-mono text-slate-200 block mt-0.5">
            {isInternalAsset ? `STOCK: ${roData.stockNumber || 'N/A'}` : `TAG: ${roData.tagNumber || 'N/A'}`}
          </span>
          <span className="font-mono text-slate-400 text-[11px] block">
            VIN: ...{roData.vinLastEight}
          </span>
        </div>

        <div className="bg-slate-950/30 p-2 rounded border border-slate-800/40">
          <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Assigned Tech</span>
          <span className="text-slate-200 font-medium block mt-0.5">
            Tech #{roData.techNumber}
          </span>
          <span className="text-slate-400 text-[11px] block">
            Dept: {roData.departmentName || roData.department}
          </span>
        </div>
      </div>

    </div>
  );
}
