import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Sparkles, Printer, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  DEALER_MENU_BRANDING,
  HYUNDAI_BUNDLE_MENUS,
  type BundleTier,
  type MileageBundleMenu,
} from '../../../data/hyundaiServiceBundleMenus';

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function savingsPercent(valuedAt: number, packageTotal: number) {
  if (valuedAt <= 0 || packageTotal <= 0) return 0;
  return Math.round(((valuedAt - packageTotal) / valuedAt) * 100);
}

function TierCard({ tier, accent }: { tier: BundleTier; accent: 'cyan' | 'emerald' | 'violet' }) {
  const save = savingsPercent(tier.valuedAt, tier.packageTotal);
  const accentStyles = {
    cyan: 'border-[#00c7dd]/35 from-[#00c7dd]/10 to-transparent ring-[#00c7dd]/20',
    emerald: 'border-emerald-400/35 from-emerald-400/10 to-transparent ring-emerald-400/20',
    violet: 'border-violet-400/35 from-violet-400/10 to-transparent ring-violet-400/20',
  }[accent];

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border bg-gradient-to-b p-4 ring-1 shadow-lg shadow-black/30',
        accentStyles
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00c7dd]">Package</p>
          <h3 className="text-lg font-black text-white tracking-tight">{tier.name}</h3>
        </div>
        {save > 0 && (
          <span className="shrink-0 rounded-full bg-[#2dd46a]/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#2dd46a] border border-[#2dd46a]/25">
            Save {save}%
          </span>
        )}
      </div>

      <ul className="flex-1 space-y-1.5 mb-4">
        {tier.items.map((item, idx) => (
          <li
            key={`${tier.id}-${idx}`}
            className={cn(
              'flex items-start justify-between gap-3 text-sm leading-snug',
              item.isNote && 'pt-1 pb-0.5'
            )}
          >
            <span
              className={cn(
                item.isNote ? 'text-[#00c7dd]/90 text-xs font-bold italic' : 'text-slate-200'
              )}
            >
              {item.isNote && <ChevronRight className="inline w-3 h-3 mr-0.5 -mt-0.5" />}
              {item.label}
            </span>
            {!item.isNote && item.price !== undefined && item.price > 0 && (
              <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">
                {formatMoney(item.price)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-auto rounded-xl bg-black/35 border border-white/5 px-3 py-2.5 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 font-bold uppercase tracking-wider">Valued at</span>
          <span className="font-mono text-slate-500 line-through tabular-nums">
            {formatMoney(tier.valuedAt)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Package total
          </span>
          <span className="font-mono text-xl font-black text-[#2dd46a] tabular-nums">
            {formatMoney(tier.packageTotal)}
          </span>
        </div>
      </div>
    </article>
  );
}

function MenuPanel({ menu }: { menu: MileageBundleMenu }) {
  const accents: Array<'cyan' | 'emerald' | 'violet'> = ['cyan', 'emerald', 'violet'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#00c7dd] mb-1">
            Essential bundle
          </p>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {menu.mileageLabel} Service Package
          </h2>
        </div>
        <div className="rounded-xl border border-[#00c7dd]/25 bg-[#00c7dd]/10 px-3 py-2 text-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-[#00c7dd]/80">From</p>
          <p className="font-mono text-lg font-black text-[#2dd46a] tabular-nums">
            {formatMoney(Math.min(...menu.tiers.map((t) => t.packageTotal)))}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {menu.tiers.map((tier, i) => (
          <TierCard key={tier.id} tier={tier} accent={accents[i] ?? 'cyan'} />
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 rounded-xl border border-[#00c7dd]/20 bg-gradient-to-r from-[#00c7dd]/10 via-transparent to-[#00c7dd]/10 px-4 py-3 text-center">
        <Sparkles className="w-4 h-4 text-[#00c7dd] shrink-0" />
        <p className="text-sm font-bold text-[#00c7dd]">
          Includes: <span className="text-slate-200 font-semibold">{menu.bonus}</span>
        </p>
      </div>
    </div>
  );
}

interface ServiceBundleMenuPreviewModalProps {
  open: boolean;
  onClose: () => void;
  initialMileageId?: string;
}

export function ServiceBundleMenuPreviewModal({
  open,
  onClose,
  initialMileageId = '15k',
}: ServiceBundleMenuPreviewModalProps) {
  const [activeId, setActiveId] = useState(initialMileageId);

  const activeMenu = useMemo(
    () => HYUNDAI_BUNDLE_MENUS.find((m) => m.id === activeId) ?? HYUNDAI_BUNDLE_MENUS[0],
    [activeId]
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close menu preview"
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm print:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bundle-menu-title"
            className={cn(
              'fixed z-[101] print:static print:z-auto',
              'inset-x-3 top-[4vh] bottom-[4vh] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2',
              'sm:w-[min(920px,calc(100vw-2rem))] sm:max-h-[90vh]',
              'flex flex-col overflow-hidden rounded-3xl',
              'border-2 border-[#00c7dd]/50 bg-[#0e1011] shadow-2xl shadow-[#00c7dd]/10',
              'print:shadow-none print:border print:rounded-none print:max-h-none print:overflow-visible'
            )}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            {/* Header */}
            <header className="relative shrink-0 border-b border-white/5 bg-gradient-to-b from-[#07282f] to-[#0f3b44] px-4 sm:px-6 py-4 print:py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/95 shadow-lg">
                    <span className="text-[10px] font-black text-[#002c5f] leading-tight text-center px-1">
                      H
                      <br />
                      SM
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h1
                      id="bundle-menu-title"
                      className="text-base sm:text-lg font-black text-white tracking-wide truncate"
                    >
                      {DEALER_MENU_BRANDING.dealerName}
                    </h1>
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] text-[#00c7dd] truncate">
                      {DEALER_MENU_BRANDING.tagline}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 print:hidden">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Print menu"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Mileage tabs */}
              <div className="mt-4 flex flex-wrap gap-2 print:hidden">
                {HYUNDAI_BUNDLE_MENUS.map((menu) => (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => setActiveId(menu.id)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all',
                      activeId === menu.id
                        ? 'bg-[#00c7dd] text-[#0e1011] shadow-lg shadow-[#00c7dd]/30'
                        : 'bg-black/30 text-slate-400 border border-white/10 hover:text-white hover:border-[#00c7dd]/40'
                    )}
                  >
                    {menu.shortLabel}
                  </button>
                ))}
              </div>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 sm:py-6 print:overflow-visible">
              <MenuPanel menu={activeMenu} />

              {/* Print: show all three menus */}
              <div className="hidden print:block print:mt-8 print:space-y-10">
                {HYUNDAI_BUNDLE_MENUS.filter((m) => m.id !== activeMenu.id).map((menu) => (
                  <div key={menu.id} className="break-before-page">
                    <MenuPanel menu={menu} />
                  </div>
                ))}
              </div>
            </div>

            <footer className="shrink-0 border-t border-white/5 px-4 py-3 text-center print:py-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                + Tax &amp; Shop Supplies
              </p>
            </footer>
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
