import React, { useState } from 'react';
import { AlertTriangle, Bell, FileWarning, KeyRound, Lightbulb, LogOut, MessageSquare, UserCheck } from 'lucide-react';
import type { User } from '../../types';
import { canSwitchDealership } from '../../lib/rbac';
import { getDealershipEnrollmentCode } from '../../lib/dealershipEnrollment';
import { isPreviewMode } from '../../lib/previewMode';
import { cn } from '../../lib/utils';
import { DealershipSwitcher } from './DealershipSwitcher';
import { ThemeToggle } from '../ui/ThemeToggle';

export interface TopBarNotification {
  id: string;
  tone: 'warning' | 'danger' | 'info';
  title: string;
  detail?: string;
  onClick?: () => void;
}

const NOTIFICATION_TONE_STYLES: Record<TopBarNotification['tone'], { icon: typeof AlertTriangle; classes: string }> = {
  danger: { icon: FileWarning, classes: 'text-rose-500 bg-rose-500/10' },
  warning: { icon: AlertTriangle, classes: 'text-amber-500 bg-amber-500/10' },
  info: { icon: UserCheck, classes: 'text-brand-primary bg-brand-primary/10' },
};

function NotificationBell({ notifications }: { notifications: TopBarNotification[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="btn-secondary p-2.5 relative"
        title="Alerts"
        aria-expanded={open}
      >
        <Bell size={16} className="text-amber-400" />
        {notifications.length > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[9px] font-black text-white flex items-center justify-center">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border shadow-lg overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                Alerts
              </p>
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs px-4 py-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                Nothing needs your attention.
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y" style={{ borderColor: 'var(--color-surface-border)' }}>
                {notifications.map((item) => {
                  const style = NOTIFICATION_TONE_STYLES[item.tone];
                  const Icon = style.icon;
                  const content = (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <span className={cn('shrink-0 rounded-lg p-1.5', style.classes)}>
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{item.title}</p>
                        {item.detail ? (
                          <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
                            {item.detail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                  return (
                    <li key={item.id}>
                      {item.onClick ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            item.onClick?.();
                          }}
                          className="w-full text-left hover:bg-slate-500/5 transition-colors"
                        >
                          {content}
                        </button>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

interface AppTopBarProps {
  user: User;
  dealershipName: string;
  currentDealershipId: string | null;
  enrollmentJoinCode?: string;
  onDealershipChange: (id: string) => void;
  onSignOut: () => void;
  onOpenSuggestions?: () => void;
  onOpenChat?: () => void;
  chatUnreadCount?: number;
  /** Only rendered when set — callers gate this on whether the user can act on any of these alerts. */
  notifications?: TopBarNotification[];
}

export function AppTopBar({
  user,
  dealershipName,
  currentDealershipId,
  enrollmentJoinCode,
  onDealershipChange,
  onSignOut,
  onOpenSuggestions,
  onOpenChat,
  chatUnreadCount = 0,
  notifications,
}: AppTopBarProps) {
  const canSwitch = canSwitchDealership(user);
  const fordEnrollmentCode =
    currentDealershipId === 'ford'
      ? getDealershipEnrollmentCode('ford', { enrollmentJoinCode })
      : '';

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

      {fordEnrollmentCode ? (
        <div
          className="hidden sm:flex items-center gap-2 rounded-lg border px-3 py-1.5 shrink-0"
          style={{
            borderColor: 'var(--color-surface-border)',
            backgroundColor: 'var(--color-surface-base)',
          }}
          title="Share this code with staff enrolling into Ford/Lincoln"
        >
          <KeyRound size={14} className="text-indigo-400 shrink-0" />
          <div className="min-w-0">
            <p
              className="text-[9px] font-black uppercase tracking-wider leading-none"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Enrollment code
            </p>
            <p
              className="font-mono text-sm font-bold tracking-widest leading-tight"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {fordEnrollmentCode}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 ml-auto">
        {isPreviewMode && (
          <span className="badge badge-warning hidden sm:inline-flex text-[10px]">Preview</span>
        )}
        <ThemeToggle compact className="hidden sm:inline-flex" />
        <div className="hidden sm:block text-right px-2">
          <p className="text-sm font-medium leading-none">{user.username}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {user.jobTitle || user.role}
          </p>
        </div>
        {notifications ? <NotificationBell notifications={notifications} /> : null}
        {onOpenChat ? (
          <button
            type="button"
            onClick={onOpenChat}
            className="btn-secondary p-2.5 relative"
            title="Team chat"
          >
            <MessageSquare size={16} className="text-indigo-300" />
            {chatUnreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[9px] font-black text-white flex items-center justify-center">
                {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
              </span>
            ) : null}
          </button>
        ) : null}
        {onOpenSuggestions ? (
          <button
            type="button"
            onClick={onOpenSuggestions}
            className="btn-secondary p-2.5"
            title="Send a suggestion"
          >
            <Lightbulb size={16} className="text-amber-400" />
          </button>
        ) : null}
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
