import React from 'react';
import { LayoutDashboard, Calendar, Bell, Search, Menu, LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MobileBottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  onOpenMenu: () => void;
  alertBadge?: number;
}

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'service-drive', label: 'Drive', icon: LayoutDashboard },
  { id: 'appointments', label: 'Ops', icon: Calendar },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'search', label: 'CRM', icon: Search },
];

export function MobileBottomNav({
  activeTab,
  onNavigate,
  onOpenMenu,
  alertBadge = 0,
}: MobileBottomNavProps) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[80] border-t border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-[0_-8px_30px_rgba(0,0,0,0.35)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary navigation"
    >
      <div className="grid grid-cols-5 h-[4.25rem] max-w-lg mx-auto px-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          const showBadge = id === 'alerts' && alertBadge > 0;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 rounded-xl mx-0.5 transition-colors touch-manipulation min-h-[44px]',
                isActive ? 'text-brand-primary' : 'text-slate-500 active:text-slate-300'
              )}
            >
              <span className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                    {alertBadge > 99 ? '99+' : alertBadge}
                  </span>
                )}
              </span>
              <span className={cn('text-[9px] font-black uppercase tracking-wide', isActive && 'text-brand-primary')}>
                {label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brand-primary" />
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl mx-0.5 text-slate-500 active:text-slate-300 touch-manipulation min-h-[44px]"
        >
          <Menu size={20} />
          <span className="text-[9px] font-black uppercase tracking-wide">More</span>
        </button>
      </div>
    </nav>
  );
}
