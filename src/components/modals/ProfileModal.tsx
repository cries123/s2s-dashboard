import React, { useState, useEffect } from 'react';
import { 
  X, Save, Edit2, Trash2, User as UserIcon, Phone, Mail, MapPin, Car, Calendar, 
  Gauge, History, Database, Wrench, Droplet, Activity, Copy, Check, ChevronRight, 
  AlertTriangle, ShieldCheck, MessageSquare, Info, Shield, HelpCircle, ArrowRight,
  Sparkles, CheckCircle2, Languages, Clock, Loader2, ChevronLeft
} from 'lucide-react';
import { collection, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Customer, User } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { useServiceAlertHelpers } from '../../context/ServiceAlertContext';
import { getLastServiceDate } from '../../lib/alerts';
import { analyzeOilChangeInterval } from '../../lib/serviceIntervalAnalytics';
import {
  CustomerTimeline,
  type TimelineEvent,
} from '../dashboard/customers/CustomerTimeline';
import { ServiceVisitDetailModal } from '../dashboard/customers/ServiceVisitDetailModal';
import { customerDisplayInitials, formatCustomerDisplayName } from '../../lib/customerName';
import { Panel } from '../ui/Panel';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { DEALERSHIPS } from '../../constants';
import type { ServiceVisit } from '../../types';

interface ProfileModalProps {
  customer: Customer;
  currentUser?: User;
  onClose: () => void;
  onDelete: (id: string, name: string) => void;
}

type TabType = 'overview' | 'demographics' | 'history' | 'campaigns';

export default function ProfileModal({ customer, currentUser, onClose, onDelete }: ProfileModalProps) {
  const serviceAlerts = useServiceAlertHelpers();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ ...customer });
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  // Browser alert()/confirm() boxes announce "localhost says" on a phone.
  const [confirmReinstate, setConfirmReinstate] = useState(false);
  const [customerNotes, setCustomerNotes] = useState(customer.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [selectedServiceVisit, setSelectedServiceVisit] = useState<ServiceVisit | null>(null);

  useEffect(() => {
    setFormData({ ...customer });
    setCustomerNotes(customer.notes || '');
  }, [customer]);

  useEffect(() => {
    if (activeTab !== 'history') return;

    const serviceEvents: TimelineEvent[] = (customer.recentVisits || []).map((visit, idx) => ({
      id: `service-${visit.id || idx}`,
      type: 'service' as const,
      date: new Date(visit.date),
      title: `Repair order #${visit.soNumber}`,
      subtitle: visit.advisor ? `Advisor: ${visit.advisor}` : undefined,
      body: visit.requests,
      meta: visit.mileage ? `${visit.mileage.toLocaleString()} mi` : undefined,
      serviceVisit: visit,
    }));

    setTimelineEvents(serviceEvents);
    setTimelineLoading(false);
  }, [activeTab, customer.id, customer.recentVisits]);

  const handleSaveNotesInline = async () => {
    setIsSavingNotes(true);
    try {
      const customerRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', customer.id);
      await updateDoc(customerRef, {
        notes: customerNotes
      });
      customer.notes = customerNotes;
      setFormData(prev => ({ ...prev, notes: customerNotes }));
    } catch (err) {
      console.error(err);
      showToast("Couldn't save the notes. Try again.", 'error');
    } finally {
      setIsSavingNotes(false);
    }
  };

  useEffect(() => {
    // Lock background body and document Element scroll behaviors when profile modal is open
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    return () => {
      // Revert back when modal gets closed
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  const [isSuspendingAlerts, setIsSuspendingAlerts] = useState(false);
  const [suspendReason, setSuspendReason] = useState('Customer Opted-Out');
  const [suspendNotes, setSuspendNotes] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const handleSuspendAlerts = async () => {
    setIsProcessingAction(true);
    try {
      const stopInfo = {
        reason: suspendReason,
        notes: suspendNotes,
        stoppedBy: currentUser?.username || 'Staff Member',
        stoppedAt: Timestamp.now()
      };

      const updatedData = {
        ...formData,
        enableServiceAlert: false,
        stopAlertInfo: stopInfo
      };

      const customerRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', formData.id);
      await updateDoc(customerRef, {
        enableServiceAlert: false,
        stopAlertInfo: stopInfo
      });

      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', formData.id, 'contactLog'), {
        timestamp: serverTimestamp(),
        userId: currentUser?.uid || 'system',
        username: currentUser?.username || 'Staff Member',
        outcome: 'Campaign Suspended',
        notes: `Alerts stopped. Reason: ${suspendReason}. Notes: ${suspendNotes}`,
        appointmentSet: false
      });

      setFormData(updatedData);
      Object.assign(customer, updatedData);

      setIsSuspendingAlerts(false);
      setSuspendNotes('');
    } catch (err) {
      console.error(err);
      showToast("Couldn't pause the reminders. Try again.", 'error');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleReinstateAlerts = async () => {
    setConfirmReinstate(false);
    setIsProcessingAction(true);
    try {
      const customerRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', formData.id);
      
      const { deleteField } = await import('firebase/firestore');
      await updateDoc(customerRef, {
        enableServiceAlert: true,
        stopAlertInfo: deleteField()
      });

      const updatedData = { ...formData, enableServiceAlert: true };
      delete updatedData.stopAlertInfo;

      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', formData.id, 'contactLog'), {
        timestamp: serverTimestamp(),
        userId: currentUser?.uid || 'system',
        username: currentUser?.username || 'Staff Member',
        outcome: 'Campaign Reinstated',
        notes: 'Automated service cycle alerts reinstated by choice.',
        appointmentSet: false
      });

      setFormData(updatedData);
      delete customer.stopAlertInfo;
      customer.enableServiceAlert = true;
    } catch (err) {
      console.error(err);
      showToast("Couldn't turn the reminders back on. Try again.", 'error');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCopyVin = () => {
    if (formData.vinLast8) {
      navigator.clipboard.writeText(formData.vinLast8);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const oilAnalysis = analyzeOilChangeInterval(customer);

  // Lifetime spend, from repair-order pay-type totals on the visits stored for this
  // customer (up to the most recent 25 — see mergeServiceVisits). Older visits synced
  // before pay-type totals existed won't have this data, so we're honest below about
  // how many visits actually contributed.
  const spendSummary = React.useMemo(() => {
    const visits = customer.recentVisits || [];
    let customerTotal = 0;
    let warrantyTotal = 0;
    let internalTotal = 0;
    let visitsWithData = 0;
    for (const visit of visits) {
      const totals = visit.payTypeTotals;
      if (!totals) continue;
      visitsWithData += 1;
      customerTotal += totals.customer.labor + totals.customer.parts;
      warrantyTotal += totals.warranty.labor + totals.warranty.parts;
      internalTotal += totals.internal.labor + totals.internal.parts;
    }
    return {
      customerTotal,
      warrantyTotal,
      internalTotal,
      visitsWithData,
      totalVisits: visits.length,
    };
  }, [customer.recentVisits]);

  const formatMoney = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { id, ...updates } = formData;
      await updateDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'customers', id), updates as any);
      Object.assign(customer, updates);
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      showToast("Couldn't save the changes. Try again.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getAvatarGradient = (first: string, last: string) => {
    const sum = (first || '').charCodeAt(0) + (last || '').charCodeAt(0);
    const gradients = [
      'from-indigo-600 to-violet-700 shadow-indigo-500/20',
      'from-blue-600 to-cyan-600 shadow-blue-500/20',
      'from-violet-600 to-fuchsia-700 shadow-violet-500/20',
      'from-emerald-600 to-teal-600 shadow-emerald-500/20',
      'from-pink-600 to-rose-700 shadow-pink-500/20'
    ];
    return gradients[isNaN(sum) ? 0 : sum % gradients.length];
  };

  const displayName = formatCustomerDisplayName(customer.firstName, customer.lastName);
  const initials = customerDisplayInitials(customer.firstName, customer.lastName);

  return (
    <div className="modal-overlay sm:p-4 p-0 !items-start sm:!items-center overflow-y-auto scroll-smooth">
      <div className="modal-content !max-w-5xl w-full h-auto min-h-[100dvh] sm:min-h-0 sm:h-[90vh] !rounded-none sm:!rounded-lg !bg-surface-base shadow-2xl relative flex flex-col overflow-visible sm:overflow-y-auto animate-zoom-in">
        
        {/* Top bar: back on the left, edit and delete on the right. */}
        <div
          className="sticky top-0 z-20 flex items-center gap-1 px-2 sm:px-4 min-h-[52px] border-b shrink-0"
          style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}
        >
          <button type="button" onClick={onClose} className="link-text text-sm inline-flex items-center gap-0.5 min-h-[44px] px-2">
            <ChevronLeft size={18} /> Back
          </button>
          <div className="flex-1" />
          {!isEditing ? (
            <button type="button" onClick={() => setIsEditing(true)} className="link-text text-sm min-h-[44px] px-3">
              Edit
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setIsEditing(false)} className="link-text text-sm min-h-[44px] px-3">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary py-2 px-4">
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onDelete(customer.id, displayName)}
            className="icon-btn hover:!text-rose-600"
            title="Delete customer"
            aria-label="Delete customer"
          >
            <Trash2 size={17} />
          </button>
        </div>

        {/* Record header: type, name, the four facts that matter, and contact actions. */}
        <div className="px-4 sm:px-6 md:px-8 pt-4 pb-3 border-b shrink-0" style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 text-sm font-semibold"
              style={{ backgroundColor: '#ece1f9', color: '#5a1ba9' }}
              aria-hidden="true"
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="crm-label">Customer</p>
              <h3 className="text-xl sm:text-2xl font-semibold leading-tight break-words">{displayName}</h3>
            </div>
            {serviceAlerts.isServiceAlertActive(customer) ? (
              <span className="badge badge-warning ml-auto shrink-0">Service due</span>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-4">
            <div className="min-w-0">
              <dt className="crm-label">Vehicle</dt>
              <dd className="text-sm font-medium truncate">{[customer.year, customer.make, customer.model].filter(Boolean).join(' ') || '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="crm-label">Next service</dt>
              <dd className="text-sm font-medium truncate">
                {serviceAlerts.isStandardMode
                  ? serviceAlerts.isServiceAlertActive(customer)
                    ? 'Due now'
                    : `Due ${serviceAlerts.getNextServiceMilestone(customer)}`
                  : oilAnalysis.hasData
                    ? `Every ${oilAnalysis.avgMonths} mo`
                    : 'Not enough history yet'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="crm-label">Mileage</dt>
              <dd className="text-sm font-medium truncate">{customer.mileage ? `${parseInt(customer.mileage).toLocaleString()} mi` : '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="crm-label">Owned since</dt>
              <dd className="text-sm font-medium truncate">
                {customer.soldDate
                  ? new Date(customer.soldDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'}
              </dd>
            </div>
          </dl>

          {customer.phone || customer.email ? (
            <div className="flex gap-6 mt-4">
              {[
                customer.phone ? { label: 'Call', href: `tel:${customer.phone}`, icon: Phone } : null,
                customer.phone ? { label: 'Text', href: `sms:${customer.phone}`, icon: MessageSquare } : null,
                customer.email ? { label: 'Email', href: `mailto:${customer.email}`, icon: Mail } : null,
              ]
                .filter(Boolean)
                .map((a) => {
                  const { label, href, icon: Icon } = a as { label: string; href: string; icon: typeof Phone };
                  return (
                    <a key={label} href={href} className="flex flex-col items-center gap-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      <span
                        className="w-11 h-11 rounded-full border flex items-center justify-center text-brand-primary"
                        style={{ borderColor: 'var(--color-input-border)', backgroundColor: 'var(--color-surface-card)' }}
                      >
                        <Icon size={18} />
                      </span>
                      {label}
                    </a>
                  );
                })}
            </div>
          ) : null}
        </div>

        {/* Underline tabs, same on every screen size. */}
        <div
          className="flex overflow-x-auto no-scrollbar border-b shrink-0 px-2 sm:px-6 md:px-8"
          style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}
          role="tablist"
        >
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'demographics', label: 'Details' },
            { id: 'history', label: `History${customer.recentVisits?.length ? ` (${customer.recentVisits.length})` : ''}` },
            { id: 'campaigns', label: 'Recalls' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={cn(
                'px-3 sm:px-4 min-h-[44px] text-sm whitespace-nowrap transition-colors',
                activeTab === tab.id ? 'font-semibold' : ''
              )}
              style={
                activeTab === tab.id
                  ? { boxShadow: 'inset 0 -3px 0 var(--color-brand-primary)', color: 'var(--color-text-primary)' }
                  : { color: 'var(--color-text-secondary)' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Panel Shell */}
        <div className="flex-1 overflow-y-visible sm:overflow-y-auto p-4 sm:p-6 md:p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + (isEditing ? '-edit' : '-view')}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-auto min-h-full w-full"
            >
              
              {/* TABS 1: SNAPSHOT OVERVIEW */}
              {activeTab === 'overview' && !isEditing && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                  <div className="lg:col-span-2 space-y-4">
                    <Panel title="Vehicle" icon={Car} tone="blue">
                      <dl>
                        <div className="list-row flex-col items-start gap-0.5 min-h-0 py-2.5">
                          <dt className="crm-label">Model</dt>
                          <dd className="text-sm">{[formData.year, formData.make, formData.model].filter(Boolean).join(' ') || '—'}</dd>
                        </div>
                        <div className="list-row min-h-0 py-2.5">
                          <div className="flex-1 min-w-0">
                            <dt className="crm-label">VIN</dt>
                            <dd className="text-sm truncate">
                              {formData.vin ? <span className="font-mono">{formData.vin}</span> : formData.vinLast8 ? <>Ends in <span className="font-mono">{formData.vinLast8}</span></> : '—'}
                            </dd>
                          </div>
                          {formData.vin || formData.vinLast8 ? (
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(formData.vin || formData.vinLast8 || '');
                                setIsCopied(true);
                                setTimeout(() => setIsCopied(false), 2000);
                              }}
                              className="icon-btn"
                              title="Copy VIN"
                              aria-label="Copy VIN"
                            >
                              {isCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                            </button>
                          ) : null}
                        </div>
                        <div className="list-row flex-col items-start gap-0.5 min-h-0 py-2.5">
                          <dt className="crm-label">Mileage</dt>
                          <dd className="text-sm">{formData.mileage ? `${parseInt(formData.mileage).toLocaleString()} mi` : '—'}</dd>
                        </div>
                        <div className="list-row flex-col items-start gap-0.5 min-h-0 py-2.5">
                          <dt className="crm-label">Preferred language</dt>
                          <dd className="text-sm">{formData.language || 'English'}</dd>
                        </div>
                      </dl>
                    </Panel>

                    <Panel title="Service pattern" icon={Droplet} tone="violet">
                      {oilAnalysis?.hasData ? (
                        <dl className="grid grid-cols-2 gap-px" style={{ backgroundColor: 'var(--color-row-divider)' }}>
                          {[
                            ['Time between visits', `${oilAnalysis.avgMonths} months`],
                            ['Miles between visits', oilAnalysis.avgMiles ? `${oilAnalysis.avgMiles.toLocaleString()} mi` : '—'],
                            ['Next oil change (est.)', oilAnalysis.nextDueDateLabel ?? '—'],
                            ['At about', oilAnalysis.nextMileage ? `${oilAnalysis.nextMileage.toLocaleString()} mi` : '—'],
                          ].map(([label, value]) => (
                            <div key={label} className="px-4 py-3" style={{ backgroundColor: 'var(--color-surface-card)' }}>
                              <dt className="crm-label">{label}</dt>
                              <dd className="text-sm font-semibold mt-0.5">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="crm-label px-4 py-5">
                          {oilAnalysis?.message ? `${oilAnalysis.message} ` : ''}
                          Estimates appear once there are a few visits on file.
                        </p>
                      )}
                    </Panel>

                    <Panel title="Notes" icon={MessageSquare} tone="amber" bodyClassName="p-4 space-y-3">
                      <textarea
                        value={customerNotes}
                        onChange={(e) => setCustomerNotes(e.target.value)}
                        className="input-field h-28 resize-none"
                        placeholder="Preferences, reminders or anything the next person should know"
                        aria-label="Notes"
                      />
                      <div className="flex justify-end">
                        <button type="button" onClick={handleSaveNotesInline} disabled={isSavingNotes} className="btn-primary">
                          {isSavingNotes ? <><Loader2 className="animate-spin" size={14} /> Saving…</> : 'Save notes'}
                        </button>
                      </div>
                    </Panel>
                  </div>

                  <div className="space-y-4">
                    <Panel title="Contact" icon={UserIcon} tone="violet">
                      {[
                        { label: 'Phone', value: formData.phone, href: formData.phone ? `tel:${formData.phone}` : undefined, icon: Phone },
                        { label: 'Email', value: formData.email, href: formData.email ? `mailto:${formData.email}` : undefined, icon: Mail },
                        {
                          label: 'Address',
                          value: formData.address ? `${formData.address}${formData.city ? `, ${formData.city}` : ''} ${formData.state || ''}`.trim() : '',
                          href: formData.address
                            ? `https://maps.google.com/?q=${encodeURIComponent(`${formData.address} ${formData.city || ''} ${formData.state || ''} ${formData.zip || ''}`)}`
                            : undefined,
                          icon: MapPin,
                        },
                      ].map(({ label, value, href, icon: Icon }) => (
                        <div key={label} className="list-row min-h-0 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="crm-label">{label}</p>
                            {href ? (
                              <a href={href} target={label === 'Address' ? '_blank' : undefined} rel="noreferrer" className="text-sm text-brand-primary break-words">
                                {value}
                              </a>
                            ) : (
                              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>—</p>
                            )}
                          </div>
                          {href ? <Icon size={16} className="shrink-0 text-brand-primary" /> : null}
                        </div>
                      ))}
                    </Panel>

                    <Panel title="Customer value" icon={Wrench} tone="teal">
                      {spendSummary.visitsWithData > 0 ? (
                        <>
                          <div className="list-row min-h-0 py-2.5">
                            <span className="flex-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Customer pay</span>
                            <span className="text-sm font-semibold tabular-nums">{formatMoney(spendSummary.customerTotal)}</span>
                          </div>
                          <div className="list-row min-h-0 py-2.5">
                            <span className="flex-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Warranty</span>
                            <span className="text-sm font-semibold tabular-nums">{formatMoney(spendSummary.warrantyTotal)}</span>
                          </div>
                          <p className="crm-label px-4 py-2.5">
                            From {spendSummary.visitsWithData} of {spendSummary.totalVisits} repair orders with pay data from PBS.
                          </p>
                        </>
                      ) : (
                        <p className="crm-label px-4 py-4">No pay data from PBS for this customer yet.</p>
                      )}
                    </Panel>

                    <Panel title="Record" icon={Shield} tone="slate">
                      {[
                        ['Sold by', customer.soldByUsername || 'Imported record'],
                        ['Store', DEALERSHIPS.find((d) => d.id === customer.dealershipId)?.name || '—'],
                        ['Service reminders', customer.enableServiceAlert === false ? 'Off' : 'On'],
                      ].map(([label, value]) => (
                        <div key={label} className="list-row min-h-0 py-2.5">
                          <span className="flex-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                          <span className="text-sm text-right">{value}</span>
                        </div>
                      ))}
                    </Panel>
                  </div>
                </div>
              )}

              {/* TABS 2: DETAILED DEMOGRAPHICS */}
              {activeTab === 'demographics' && !isEditing && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
                  {/* Personal Demographics */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                    <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2 border-b border-white/5 pb-3">
                      <UserIcon size={14} className="text-brand-primary" /> Profile Identification
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="crm-label">First name</span>
                        <p className="text-sm font-semibold mt-1">{formData.firstName || 'Not Recorded'}</p>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="crm-label">Last name</span>
                        <p className="text-sm font-semibold mt-1">{formData.lastName || 'Not Recorded'}</p>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="text-xs font-semibold text-slate-500">Mobile Phone</span>
                        <p className="text-sm font-semibold mt-1 font-mono">{formData.phone || 'Not Recorded'}</p>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="text-xs font-semibold text-slate-500">Preferred Language</span>
                        <p className="text-sm font-semibold mt-1">{formData.language || 'English'}</p>
                      </div>

                      <div className="col-span-1 sm:col-span-2 p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                        <span className="text-xs font-semibold text-slate-500">Primary Email Address</span>
                        <p className="text-sm font-semibold mt-1 break-all font-mono">{formData.email || 'Not Stored'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Address Coordinates */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                    <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2 border-b border-white/5 pb-3">
                      <MapPin size={14} className="text-indigo-400" /> Residential Geography
                    </h4>

                    <div className="space-y-3 sm:space-y-4">
                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl">
                        <span className="text-xs font-semibold text-slate-500">Street Address</span>
                        <p className="text-sm font-semibold text-white mt-1">{formData.address || '—'}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                          <span className="text-xs font-semibold text-slate-500">City</span>
                          <p className="text-sm font-semibold mt-1 truncate">{formData.city || 'N/A'}</p>
                        </div>

                        <div className="p-3 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                          <span className="text-xs font-semibold text-slate-500">State</span>
                          <p className="text-sm font-semibold mt-1 truncate">{formData.state || 'N/A'}</p>
                        </div>

                        <div className="p-3 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl text-slate-200">
                          <span className="text-xs font-semibold text-slate-500">ZIP</span>
                          <p className="text-sm font-semibold mt-1 truncate font-mono">{formData.zip || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-slate-950/30 border border-white/5 rounded-xl sm:rounded-2xl text-xs text-slate-400 flex items-start gap-3">
                        <Info size={16} className="text-brand-primary shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                          These demographic values are utilized for mailing list compilation and language-specific customer touchpoints in automated workflows.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TABS 3: SERVICE HISTORY CHRONICLE */}
              {activeTab === 'history' && !isEditing && (
                <div className="space-y-4 sm:space-y-6">
                  <div className="flex items-center justify-between border-b pb-4 gap-4" style={{ borderColor: 'var(--color-surface-border)' }}>
                    <div>
                      <h4 className="crm-section-title flex items-center gap-2">
                        <History size={14} className="text-brand-primary" />
                        Activity timeline
                      </h4>
                      <p className="crm-label mt-0.5">Service visits and staff contact logs in one view</p>
                    </div>
                    <span className="badge badge-info shrink-0">
                      {timelineEvents.length} events
                    </span>
                  </div>

                  <CustomerTimeline
                    events={timelineEvents}
                    loading={timelineLoading}
                    onServiceVisitClick={setSelectedServiceVisit}
                  />
                </div>
              )}

              {/* TABS 4: SERVICE ALERTS & CAMPAIGNS */}
              {activeTab === 'campaigns' && !isEditing && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                  {/* Alert Control panel */}
                  <div className="lg:col-span-2 space-y-4 sm:space-y-6 lg:space-y-8">
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                      <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2 border-b border-white/5 pb-3">
                        <BellAlertIcon size={14} className="text-brand-secondary" /> Automated Communications
                      </h4>
                      
                      <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-1 pr-4">
                          <p className="text-xs font-semibold text-white">Service Alert Triggers</p>
                          <p className="text-xs font-medium text-slate-500 leading-relaxed">
                            Control when automated service suggestions are computed or sent for this profile.
                          </p>
                        </div>
                        <div className="flex items-center shrink-0">
                          <span className={cn(
                            "badge py-1 px-2.5 rounded-lg text-xs font-semibold sm:mr-3",
                            formData.enableServiceAlert ? "badge-success" : "badge-error"
                          )}>
                            {formData.enableServiceAlert ? "ACTIVE" : "STOPPED"}
                          </span>
                        </div>
                      </div>

                      {/* Interactive Section for Alert Removal */}
                      {!formData.stopAlertInfo ? (
                        <div className="space-y-4">
                          {!isSuspendingAlerts ? (
                            <button
                              type="button"
                              onClick={() => setIsSuspendingAlerts(true)}
                              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/40 transition-all duration-200"
                            >
                              <X size={14} /> Remove Customer From Service Alerts
                            </button>
                          ) : (
                            <div className="p-4 sm:p-5 bg-rose-500/5 border border-rose-500/10 rounded-xl sm:rounded-2xl space-y-4">
                              <div className="border-b border-rose-500/10 pb-2">
                                <h5 className="text-xs font-semibold text-rose-400 flex items-center gap-2">
                                  <AlertTriangle size={13} /> Deactivate Maintenance Reminders
                                </h5>
                                <p className="text-xs text-rose-300/60 font-medium mt-0.5">Please file a reason and matching notes for this authorization.</p>
                              </div>

                              <div className="space-y-4">
                                <div className="space-y-1.5">
                                  <label htmlFor="suspend-reason" className="text-xs font-semibold text-rose-400 ">Reason for Removal</label>
                                  <select
                                    id="suspend-reason"
                                    value={suspendReason}
                                    onChange={(e) => setSuspendReason(e.target.value)}
                                    className="w-full bg-surface-muted border border-rose-500/20 text-slate-200 px-3 py-2.5 rounded-lg text-xs font-bold focus:outline-none focus:border-rose-500/50"
                                  >
                                    <option value="Customer Opted-Out">Customer Opted-Out / Do Not Contact</option>
                                    <option value="Vehicle Sold">Vehicle Sold / Transferred Account</option>
                                    <option value="Bad Contact Data">Bad Contact Info (Phone/Email)</option>
                                    <option value="Service Completed Elsewhere">Service Completed Elsewhere</option>
                                    <option value="Moved Away">Moved Away / Out of Area</option>
                                    <option value="Incorrect Owner Profile">Incorrect Owner Profile</option>
                                    <option value="Other">Other (Document in Notes)</option>
                                  </select>
                                </div>

                                <div className="space-y-1.5">
                                  <label htmlFor="suspend-notes" className="text-xs font-semibold text-rose-400 ">Internal Authorization Notes</label>
                                  <textarea
                                    id="suspend-notes"
                                    value={suspendNotes}
                                    onChange={(e) => setSuspendNotes(e.target.value)}
                                    placeholder="Add background context, conversation notes, or specific customer requests here..."
                                    rows={3}
                                    className="w-full bg-surface-muted border border-rose-500/20 text-slate-200 px-3 py-2.5 rounded-lg text-xs placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsSuspendingAlerts(false);
                                      setSuspendNotes('');
                                    }}
                                    disabled={isProcessingAction}
                                    className="py-2.5 text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-750 border border-white/5 rounded-lg transition-all"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSuspendAlerts}
                                    disabled={isProcessingAction}
                                    className="py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-lg shadow-rose-950/20 transition-all flex items-center justify-center gap-2"
                                  >
                                    {isProcessingAction ? "Processing..." : "Confirm Suspension"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {/* Show Stopped Alerts info if exist */}
                    {formData.stopAlertInfo && (
                      <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-rose-500/10 pb-3 gap-2">
                          <h5 className="text-xs font-semibold text-rose-400 flex items-center gap-2">
                            <AlertTriangle size={14} /> Suspended Campaign Information
                          </h5>
                          
                          <button
                            type="button"
                            onClick={() => setConfirmReinstate(true)}
                            disabled={isProcessingAction}
                            className="self-start sm:self-auto py-1 px-3 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 rounded-lg text-xs font-semibold text-emerald-300 transition-all"
                          >
                            {isProcessingAction ? "Processing..." : "Reinstate Reminders"}
                          </button>
                        </div>
                        <div className="space-y-3 text-xs text-rose-300/80">
                          <p className="leading-relaxed">
                            <span className="font-semibold text-white block">Suspended Code / Reason</span>
                            {formData.stopAlertInfo.reason}
                          </p>
                          {formData.stopAlertInfo.notes && (
                            <p className="leading-relaxed">
                              <span className="font-semibold text-white block">Notes / Observations</span>
                              {formData.stopAlertInfo.notes}
                            </p>
                          )}
                          <div className="pt-2 flex flex-col sm:flex-row justify-between text-xs font-semibold text-rose-400/60 font-mono gap-1">
                            <span>Authorizer: {formData.stopAlertInfo.stoppedBy}</span>
                            <span>Date: {formData.stopAlertInfo.stoppedAt ? new Date(formData.stopAlertInfo.stoppedAt.toMillis()).toLocaleDateString() : 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
                      <p className="text-xs font-semibold text-slate-400 flex items-center gap-2 border-b border-white/5 pb-3">
                        <Database size={14} className="text-brand-secondary" /> Service History Summary
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 bg-slate-950/40 border border-white/5 rounded-xl">
                          <span className="text-xs font-semibold text-slate-500 block">Reminder Interval</span>
                          <span className="text-xs font-semibold text-emerald-400 mt-1 block">
                            6 Months
                          </span>
                        </div>
                        
                        <div className="p-3.5 bg-slate-950/40 border border-white/5 rounded-xl">
                          <span className="text-xs font-semibold text-slate-500 block">Total Visits</span>
                          <span className="text-xs font-semibold text-white mt-1 block">
                            {formData.recentVisits?.length || 0} Logs
                          </span>
                        </div>

                        <div className="p-3.5 bg-slate-950/40 border border-white/5 rounded-xl">
                          <span className="text-xs font-semibold text-slate-500 block">Last Service</span>
                          <span className="text-xs font-semibold text-slate-300 mt-1 block">
                            {getLastServiceDate(formData) ? getLastServiceDate(formData)!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : 'N/A'}
                          </span>
                        </div>

                        <div className="p-3.5 bg-slate-950/40 border border-white/5 rounded-xl">
                          <span className="text-xs font-semibold text-slate-500 block">Next Due Date</span>
                          <span className="text-xs font-semibold text-brand-secondary mt-1 block">
                            {serviceAlerts.getNextServiceMilestone(formData)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* EDIT MODE RENDER FIELD LISTS */}
              {isEditing && (
                <div className="bg-slate-900/30 border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-6 sm:space-y-8 max-w-4xl mx-auto">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                        <Edit2 size={14} className="text-brand-secondary" /> Edit customer
                      </h4>
                      <p className="text-xs font-bold text-slate-500 mt-0.5">Please ensure all required CRM fields match official records.</p>
                    </div>
                  </div>

                  <div className="space-y-6 sm:space-y-8">
                    {/* Part 1: Personal Specifications */}
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-brand-primary ">Name</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-first-name" className="input-label">First name</label>
                          <input id="profilemod-first-name" name="firstName" value={formData.firstName} onChange={handleChange} className="input-field" placeholder="Liam" />
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-last-name" className="input-label">Last name</label>
                          <input id="profilemod-last-name" name="lastName" value={formData.lastName} onChange={handleChange} className="input-field" placeholder="Cooper" />
                        </div>
                      </div>
                    </div>

                    {/* Part 2: Contact Options */}
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-brand-primary ">Contact</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-phone-connection" className="input-label">Phone Connection</label>
                          <input id="profilemod-phone-connection" name="phone" value={formData.phone} onChange={handleChange} className="input-field font-mono" placeholder="(805) 555-0100" />
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-email-system-address" className="input-label">Email System Address</label>
                          <input id="profilemod-email-system-address" name="email" value={formData.email} onChange={handleChange} className="input-field font-mono" placeholder="name@example.com" />
                        </div>
                      </div>
                    </div>

                    {/* Part 3: Vehicle Specs */}
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-indigo-400 ">Vehicle</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-model-year" className="input-label">Model Year</label>
                          <input id="profilemod-model-year" name="year" value={formData.year || ''} onChange={handleChange} className="input-field font-mono" placeholder="e.g. 2024" />
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-vehicle-make" className="input-label">Vehicle Make</label>
                          <input id="profilemod-vehicle-make" name="make" value={formData.make} onChange={handleChange} className="input-field" placeholder="e.g. Hyundai" />
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-vehicle-model" className="input-label">Vehicle Model</label>
                          <input id="profilemod-vehicle-model" name="model" value={formData.model} onChange={handleChange} className="input-field" placeholder="e.g. Tucson" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="space-y-1.5 sm:col-span-2">
                          <label htmlFor="profilemod-full-chassis-vin-17-characte" className="input-label">Full Chassis VIN (17 Characters)</label>
                          <input id="profilemod-full-chassis-vin-17-characte" 
                            name="vin" 
                            value={formData.vin || ''} 
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setFormData(prev => ({ 
                                ...prev, 
                                vin: val, 
                                vinLast8: val.length >= 8 ? val.slice(-8) : prev.vinLast8 
                              }));
                            }} 
                            className="input-field font-mono text-brand-secondary " 
                            placeholder="Full 17-character VIN" 
                            maxLength={17} 
                          />
                        </div>
                        <div className="space-y-1.5 col-span-1">
                          <label htmlFor="profilemod-global-vin-last-8" className="input-label">Global VIN (Last 8)</label>
                          <input id="profilemod-global-vin-last-8" name="vinLast8" value={formData.vinLast8} onChange={handleChange} className="input-field font-mono text-brand-secondary" placeholder="ABC12345" maxLength={8} />
                        </div>
                        <div className="space-y-1.5 col-span-1">
                          <label htmlFor="profilemod-mileage" className="input-label">Mileage</label>
                          <input id="profilemod-mileage" name="mileage" value={formData.mileage || ''} onChange={handleChange} className="input-field font-mono" placeholder="e.g. 24500" inputMode="numeric" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-delivery-date" className="input-label font-bold text-slate-300">Delivery Date</label>
                          <input id="profilemod-delivery-date" name="soldDate" type="date" value={formData.soldDate} onChange={handleChange} className="input-field" />
                        </div>
                      </div>
                    </div>

                    {/* Part 4: Address Coordinates */}
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-rose-400 ">Address</p>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-street-address" className="input-label">Street address</label>
                          <input id="profilemod-street-address" name="address" value={formData.address || ''} onChange={handleChange} className="input-field" placeholder="Street address" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                          <div className="space-y-1.5">
                            <label htmlFor="profilemod-city" className="input-label">City</label>
                            <input id="profilemod-city" name="city" value={formData.city || ''} onChange={handleChange} className="input-field" placeholder="City" />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="profilemod-state-code" className="input-label">State Code</label>
                            <input id="profilemod-state-code" name="state" value={formData.state || ''} onChange={handleChange} className="input-field" placeholder="State" />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="profilemod-zip-blueprint-code" className="input-label">Zip Blueprint Code</label>
                            <input id="profilemod-zip-blueprint-code" name="zip" value={formData.zip || ''} onChange={handleChange} className="input-field font-mono" placeholder="ZIP" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Part 5: Campaign & Language preferences */}
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-emerald-400 ">Service reminders</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="profilemod-communication-dialect" className="input-label">Communication Dialect</label>
                          <input id="profilemod-communication-dialect" name="language" value={formData.language || ''} onChange={handleChange} className="input-field" placeholder="e.g. English, Spanish" />
                        </div>
                        
                        <div className="p-3.5 sm:p-4 bg-slate-950/40 border border-white/5 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold text-slate-400 block">S2S Campaign Subscriptions</span>
                            <span className="text-xs text-slate-500 font-medium">Allow automated retention alerts</span>
                          </div>
                          <label className="tap-expand relative inline-flex items-center cursor-pointer shrink-0 mt-1 sm:mt-0">
                            <input 
                              type="checkbox" 
                              name="enableServiceAlert" 
                              checked={formData.enableServiceAlert} 
                              onChange={(e) => setFormData(prev => ({ ...prev, enableServiceAlert: e.target.checked }))}
                              className="sr-only peer" 
                            />
                            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary" />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Part 6: Profile Notes */}
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-amber-500 ">Notes</p>
                      <div className="space-y-1.5">
                        <label htmlFor="profilemod-customer-profile-notes" className="input-label">Customer Profile Notes</label>
                        <textarea id="profilemod-customer-profile-notes"
                          name="notes"
                          value={formData.notes || ''}
                          onChange={handleChange}
                          className="w-full bg-surface-muted border border-white/5 focus:border-brand-primary/50 text-slate-200 p-4 rounded-xl text-xs font-semibold focus:outline-none placeholder:text-slate-600 transition-all h-28 resize-none"
                          placeholder="Persistent notes about this customer (will be displayed on alerts and profile)..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>



      </div>

      {selectedServiceVisit && (
        <ServiceVisitDetailModal
          visit={selectedServiceVisit}
          customerName={formatCustomerDisplayName(customer.firstName, customer.lastName)}
          vehicleLabel={[customer.year, customer.make, customer.model].filter(Boolean).join(' ')}
          onClose={() => setSelectedServiceVisit(null)}
        />
      )}

      <ConfirmModal
        open={confirmReinstate}
        title="Turn service reminders back on?"
        description="This customer will start receiving service reminders again."
        confirmLabel="Turn on"
        onConfirm={handleReinstateAlerts}
        onCancel={() => setConfirmReinstate(false)}
        loading={isProcessingAction}
      />
    </div>
  );
}

// Inline fallback for bell alert icon
function BellAlertIcon({ className, size }: { className?: string, size?: number }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 16} 
      height={size || 16} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
