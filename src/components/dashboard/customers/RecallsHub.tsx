import React, { useState, Component, type ErrorInfo, type ReactNode, useCallback } from 'react';
import { cn } from '../../../lib/utils';
import { Customer } from '../../../types';
import { VehicleRecalls } from './VehicleRecalls';
import { RecallCampaignOutreach } from './RecallCampaignOutreach';

class RecallOutreachErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RecallsHub] Recall outreach render failed:', error, info);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

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

  const handleNotify = useCallback(
    (message: string, isError?: boolean) => onNotify?.(message, isError),
    [onNotify]
  );

  const nhtsaFallback = <VehicleRecalls onViewProfile={onViewProfile} />;

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
        <RecallOutreachErrorBoundary fallback={nhtsaFallback}>
          <RecallCampaignOutreach
            currentDealershipId={currentDealershipId}
            currentUserId={currentUserId}
            onNotify={handleNotify}
          />
        </RecallOutreachErrorBoundary>
      ) : (
        nhtsaFallback
      )}
    </div>
  );
}
