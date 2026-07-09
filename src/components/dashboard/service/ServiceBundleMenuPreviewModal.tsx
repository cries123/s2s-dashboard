import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Sparkles, Printer, Maximize2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  DEALER_MENU_BRANDING,
  HYUNDAI_BUNDLE_MENUS,
  type BundleTier,
  type MileageBundleMenu,
} from '../../../data/hyundaiServiceBundleMenus';

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function savingsPercent(valuedAt: number, packageTotal: number) {
  if (valuedAt <= 0 || packageTotal <= 0) return 0;
  return Math.round(((valuedAt - packageTotal) / valuedAt) * 100);
}

function TierBlock({ tier, compact }: { tier: BundleTier; compact?: boolean }) {
  const save = savingsPercent(tier.valuedAt, tier.packageTotal);

  return (
    <div className="rounded-xl border border-white/8 bg-[#141617]/90 p-3 flex flex-col min-h-0 overflow-hidden h-full">
      <div className="flex items-center justify-between gap-2 mb-2 border-b border-white/5 pb-2">
        <h3 className={cn('font-black text-white uppercase tracking-wide', compact ? 'text-sm' : 'text-base')}>
          {tier.name}
        </h3>
        {save > 0 && (
          <span className="text-[9px] font-black uppercase tracking-wider text-[#2dd46a] bg-[#2dd46a]/10 px-2 py-0.5 rounded-full border border-[#2dd46a]/25">
            -{save}%
          </span>
        )}
      </div>

      <ul className={cn('flex-1 space-y-0.5 mb-2 overflow-hidden', compact ? 'text-[10px]' : 'text-xs')}>
        {tier.items.map((item, idx) => (
          <li
            key={`${tier.id}-${idx}`}
            className={cn(
              'leading-snug',
              item.isNote ? 'text-[#00c7dd] font-bold italic text-[10px] pt-0.5' : 'text-slate-300'
            )}
          >
            {item.label}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-end justify-between gap-2 pt-2 border-t border-white/5">
        <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
          Valued{' '}
          <span className="line-through text-slate-600 font-mono">{formatMoney(tier.valuedAt)}</span>
        </div>
        <div className="text-right">
          <p className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Package</p>
          <p className="font-mono font-black text-[#2dd46a] tabular-nums text-lg leading-none">
            {formatMoney(tier.packageTotal)}
          </p>
        </div>
      </div>
    </div>
  );
}

function MileageColumn({ menu, compact }: { menu: MileageBundleMenu; compact?: boolean }) {
  return (
    <section className="flex flex-col min-h-0 h-full rounded-2xl border border-[#00c7dd]/30 bg-[#0e1011]/80 overflow-hidden">
      <header className="shrink-0 bg-gradient-to-r from-[#07282f] to-[#0f3b44] px-3 py-2.5 border-b border-[#00c7dd]/25">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#00c7dd]">Essential Bundle</p>
        <h2 className={cn('font-black text-white tracking-tight leading-tight', compact ? 'text-sm' : 'text-base')}>
          {menu.mileageLabel}
        </h2>
      </header>

      <div className="flex-1 grid grid-rows-3 gap-2 p-2 min-h-0">
        {menu.tiers.map((tier) => (
          <TierBlock key={tier.id} tier={tier} compact={compact} />
        ))}
      </div>

      <footer className="shrink-0 mx-2 mb-2 rounded-lg border border-[#00c7dd]/15 bg-[#00c7dd]/8 px-2 py-1.5 text-center">
        <p className="text-[9px] font-bold text-[#00c7dd] leading-snug">
          <Sparkles className="inline w-3 h-3 mr-1 -mt-0.5" />
          Includes: {menu.bonus}
        </p>
      </footer>
    </section>
  );
}

interface ServiceBundleMenuBoardProps {
  tvMode?: boolean;
  onClose?: () => void;
  onOpenFullscreen?: () => void;
  className?: string;
}

/** All 15K / 30K / 45K menus on one board — built for TV & kiosk displays. */
export function ServiceBundleMenuBoard({
  tvMode = false,
  onClose,
  onOpenFullscreen,
  className,
}: ServiceBundleMenuBoardProps) {
  const handlePrint = () => window.print();

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-[#0e1011] text-[#eef6f7]',
        tvMode && 'min-h-screen',
        className
      )}
    >
      <header className="shrink-0 border-b border-[#00c7dd]/40 bg-gradient-to-b from-[#07282f] to-[#0f3b44] px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-lg">
              <span className="text-[9px] font-black text-[#002c5f] leading-tight text-center">HSM</span>
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-wide">
                {DEALER_MENU_BRANDING.dealerName}
              </h1>
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.12em] text-[#00c7dd]">
                {DEALER_MENU_BRANDING.tagline}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 print:hidden">
            {onOpenFullscreen && !tvMode && (
              <button
                type="button"
                onClick={onOpenFullscreen}
                className="p-2 rounded-xl text-slate-400 hover:text-[#00c7dd] hover:bg-white/10"
                title="Open TV / fullscreen view"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
              title="Print"
            >
              <Printer className="w-5 h-5" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-3 sm:p-4 overflow-hidden">
        <div className="grid grid-cols-3 gap-2 sm:gap-3 h-full min-h-0">
          {HYUNDAI_BUNDLE_MENUS.map((menu) => (
            <MileageColumn key={menu.id} menu={menu} compact={tvMode} />
          ))}
        </div>
      </main>

      <footer className="shrink-0 border-t border-white/5 py-2 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-600">
          + Tax &amp; Shop Supplies
        </p>
      </footer>
    </div>
  );
}

interface ServiceBundleMenuPreviewModalProps {
  open: boolean;
  onClose: () => void;
}

export function ServiceBundleMenuPreviewModal({ open, onClose }: ServiceBundleMenuPreviewModalProps) {
  const openTvWindow = () => {
    window.open('/service/bundle-menus', '_blank', 'noopener,noreferrer');
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/80 print:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Service bundle menu board"
            className={cn(
              'fixed inset-0 z-[101] flex flex-col print:static',
              'border-0 shadow-2xl shadow-[#00c7dd]/10 print:shadow-none'
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ServiceBundleMenuBoard
              tvMode
              onClose={onClose}
              onOpenFullscreen={openTvWindow}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function ServiceBundleMenuPreviewButton({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider',
        'border border-[#00c7dd]/40 bg-[#00c7dd]/10 text-[#00c7dd]',
        'hover:bg-[#00c7dd]/20 hover:border-[#00c7dd]/60 transition-colors',
        className
      )}
    >
      <Sparkles className="w-3.5 h-3.5" />
      Bundle Menus
    </button>
  );
}

export function ServiceBundleMenuTvPage() {
  return <ServiceBundleMenuBoard tvMode />;
}
