import React, { useState } from 'react';
import { cn } from '../../../lib/utils';
import { Customer } from '../../../types';
import { VehicleRecalls } from './VehicleRecalls';
import { RecallCampaignOutreach } from './RecallCampaignOutreach';

interface RecallsHubProps {
  onViewProfile?: (customer: Customer) => void;
  currentDealershipId: string;
  currentUserId: string;
  onNotify?: (message: string, isError?: boolean) => void;
}

export function RecallsHub({
  onViewProfile,
  currentDealershipId,
  currentUserId,
  onNotify,
}: RecallsHubProps) {
  const [activeView, setActiveView] = useState<'campaign' | 'nhtsa'>('campaign');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 p-1 bg-slate-950/60 border border-white/5 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setActiveView('campaign')}
          className={cn(
            'px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
            activeView === 'campaign'
              ? 'bg-brand-primary text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
          )}
        >
          Pending Campaign List
        </button>
        <button
          type="button"
          onClick={() => setActiveView('nhtsa')}
          className={cn(
            'px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
            activeView === 'nhtsa'
              ? 'bg-brand-primary text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
          )}
        >
          NHTSA Directory Sync
        </button>
      </div>

      {activeView === 'campaign' ? (
        <RecallCampaignOutreach
          currentDealershipId={currentDealershipId}
          currentUserId={currentUserId}
          onNotify={onNotify}
        />
      ) : (
        <VehicleRecalls onViewProfile={onViewProfile} />
      )}
    </div>
  );
}
