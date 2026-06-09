import React from 'react';
import { LogOut } from 'lucide-react';
import type { User } from '../../types';
import { canSwitchDealership } from '../../lib/rbac';
import { DealershipSwitcher } from './DealershipSwitcher';
import { isPreviewMode } from '../../lib/previewMode';

interface AppTopBarProps {
  user: User;
  dealershipName: string;
  currentDealershipId: string | null;
  onDealershipChange: (id: string) => void;
  onSignOut: () => void;
}

export function AppTopBar({
  user,
  dealershipName,
  currentDealershipId,
  onDealershipChange,
  onSignOut,
}: AppTopBarProps) {
  const canSwitch = canSwitchDealership(user);

  return (
    <header
      className="sticky top-0 z-40 border-b px-4 sm:px-6 h-14 flex items-center justify-between gap-4"
      style={{
        backgroundColor: 'var(--color-surface-card)',
        borderColor: 'var(--color-surface-border)',
      }}
    >
      <div className="min-w-0 flex-1 max-w-xs sm:max-w-sm">
        {canSwitch ? (
          <DealershipSwitcher
            compact
            value={currentDealershipId || 'hyundai'}
            onChange={onDealershipChange}
          />
        ) : (
          <div>
            <p className="text-sm font-semibold truncate">{dealershipName}</p>
            <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
              Service to Sales
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {isPreviewMode && (
          <span className="badge badge-warning hidden sm:inline-flex text-[10px]">Preview</span>
        )}
        <div className="hidden sm:block text-right px-2">
          <p className="text-sm font-medium leading-none">{user.username}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {user.jobTitle || user.role}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="btn-secondary p-2.5"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
