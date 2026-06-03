import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckSquare,
  FileUp,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  Users,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../../../firebase';
import { cn } from '../../../lib/utils';
import { extractTextFromPDF } from '../../../utils/pdfExtractor';
import {
  recallCampaignLeadDocId,
  type RecallCampaignParseMeta,
  normalizeRecallEmail,
  normalizeRecallPhone,
} from '../../../lib/recallCampaignParser';
import { RecallManualAddForm, type ManualRecallLeadInput } from './RecallManualAddForm';

export interface RecallCampaignLead {
  id: string;
  dealershipId: string;
  importBatchId: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  vin: string;
  year: string;
  make: string;
  model: string;
  campaignNumber: string;
  campaignDescription?: string;
  reportGeneratedOn?: string;
  outreachStatus: 'pending' | 'text_sent' | 'email_sent' | 'no_contact';
  lastOutreachAt?: string;
  lastOutreachChannel?: 'sms' | 'email';
  importedAt?: unknown;
  importedBy?: string;
}

interface RecallCampaignOutreachProps {
  currentDealershipId: string;
  currentUserId: string;
  onNotify?: (message: string, isError?: boolean) => void;
}

const DEFAULT_SMS_TEMPLATE =
  'Hi {name}, this is Hyundai of Santa Maria Service. Our records show your {year} {make} {model} has an open safety recall (campaign {campaign}). Reply or call us to schedule your complimentary repair. Thank you!';

const DEFAULT_EMAIL_SUBJECT = 'Important: Open Safety Recall on Your Vehicle';

const BATCH_SIZE = 200;

export function RecallCampaignOutreach({
  currentDealershipId,
  currentUserId,
  onNotify,
}: RecallCampaignOutreachProps) {
  const [leads, setLeads] = useState<RecallCampaignLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(DEFAULT_SMS_TEMPLATE);
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [outreachChannel, setOutreachChannel] = useState<'sms' | 'email'>('sms');
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [defaultCampaign, setDefaultCampaign] = useState('9C2');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback(
    (text: string, isError = false) => onNotify?.(text, isError),
    [onNotify]
  );

  useEffect(() => {
    fetch('/api/outreach/status')
      .then((r) => r.json())
      .then((data) => {
        setSmsConfigured(!!data.smsConfigured);
        setEmailConfigured(!!data.emailConfigured);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentDealershipId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const colRef = collection(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'recallCampaignLeads'
    );

    const applyRows = (docs: { id: string; data: () => Record<string, unknown> }[]) => {
      const rows = docs
        .map((d) => ({ id: d.id, ...d.data() }) as RecallCampaignLead)
        .filter((l) => !l.dealershipId || l.dealershipId === currentDealershipId);
      rows.sort((a, b) => (a.customerName || '').localeCompare(b.customerName || ''));
      setLeads(rows);
      const campaign = rows.find((r) => r.campaignNumber)?.campaignNumber;
      if (campaign) setDefaultCampaign(campaign);
      setLoading(false);
    };

    const timeout = window.setTimeout(() => setLoading(false), 8000);

    const unsub = onSnapshot(
      colRef,
      (snap) => {
        window.clearTimeout(timeout);
        applyRows(snap.docs);
        setLoadError(null);
      },
      (err) => {
        window.clearTimeout(timeout);
        console.error('recallCampaignLeads listener error', err);
        setLoading(false);
        setLoadError(
          'Could not load recall list. Deploy Firestore rules for recallCampaignLeads, then refresh.'
        );
        notify('Failed to load recall campaign list.', true);
      }
    );

    return () => {
      window.clearTimeout(timeout);
      unsub();
    };
  }, [currentDealershipId, notify]);

  const filteredLeads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.customerName?.toLowerCase().includes(q) ||
        l.vin?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.campaignNumber?.toLowerCase().includes(q)
    );
  }, [leads, searchTerm]);

  const stats = useMemo(
    () => ({
      total: leads.length,
      withPhone: leads.filter((l) => l.phone).length,
      withEmail: leads.filter((l) => l.email).length,
      contacted: leads.filter((l) => l.outreachStatus !== 'pending').length,
    }),
    [leads]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
  };

  const selectWithPhone = () => {
    setSelectedIds(new Set(filteredLeads.filter((l) => l.phone).map((l) => l.id)));
  };

  const selectWithEmail = () => {
    setSelectedIds(new Set(filteredLeads.filter((l) => l.email).map((l) => l.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const saveLeadsToFirestore = async (
    parsedLeads: Array<{
      customerName: string;
      phone: string | null;
      email: string | null;
      vin: string;
      year: string;
      make: string;
      model: string;
      campaignNumber: string;
    }>,
    meta: RecallCampaignParseMeta,
    importBatchId: string
  ) => {
    const colRef = collection(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'recallCampaignLeads'
    );

    for (let i = 0; i < parsedLeads.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = parsedLeads.slice(i, i + BATCH_SIZE);
      for (const lead of chunk) {
        const id = recallCampaignLeadDocId(
          currentDealershipId,
          lead.vin,
          lead.campaignNumber
        );
        batch.set(
          doc(colRef, id),
          {
            dealershipId: currentDealershipId,
            importBatchId,
            customerName: lead.customerName || 'Unknown Owner',
            phone: lead.phone,
            email: lead.email,
            vin: lead.vin,
            year: lead.year,
            make: lead.make,
            model: lead.model,
            campaignNumber: lead.campaignNumber,
            campaignDescription: meta.campaignDescription || '',
            reportGeneratedOn: meta.reportGeneratedOn || '',
            outreachStatus: lead.phone || lead.email ? 'pending' : 'no_contact',
            importedAt: serverTimestamp(),
            importedBy: currentUserId,
          },
          { merge: true }
        );
      }
      await batch.commit();
    }
  };

  const saveSingleLead = async (input: ManualRecallLeadInput) => {
    const phone = normalizeRecallPhone(input.phone);
    const email = normalizeRecallEmail(input.email);
    await saveLeadsToFirestore(
      [
        {
          customerName: input.customerName,
          phone,
          email,
          vin: input.vin.toUpperCase(),
          year: input.year,
          make: input.make,
          model: input.model,
          campaignNumber: input.campaignNumber || defaultCampaign,
        },
      ],
      { campaignNumber: input.campaignNumber || defaultCampaign },
      `manual_${Date.now()}`
    );
    notify('Customer added to recall list.');
  };

  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const reportText = await extractTextFromPDF(file);
      const response = await fetch('/api/parse-recall-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportText }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to parse recall report');
      }
      const data = await response.json();
      const importBatchId = `batch_${Date.now()}`;
      await saveLeadsToFirestore(data.leads, data.meta, importBatchId);
      notify(
        `Imported ${data.leadCount} recall customers (${data.duplicateCount} duplicates merged). ` +
          `${data.withPhone} with phone, ${data.withEmail} with email.`
      );
    } catch (err: unknown) {
      console.error(err);
      notify(err instanceof Error ? err.message : 'Import failed', true);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendToRecipients = async (recipients: RecallCampaignLead[], channel: 'sms' | 'email') => {
    if (recipients.length === 0) {
      notify('No customers match this send action.', true);
      return;
    }
    if (channel === 'sms' && !smsConfigured) {
      notify('SMS not configured on server (Twilio env vars).', true);
      return;
    }
    if (channel === 'email' && !emailConfigured) {
      notify('Email not configured on server (SendGrid env vars).', true);
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/outreach/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          message,
          subject: emailSubject,
          recipients: recipients.map((l) => ({
            id: l.id,
            customerName: l.customerName,
            phone: l.phone,
            email: l.email,
            year: l.year,
            make: l.make,
            model: l.model,
            campaignNumber: l.campaignNumber,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Send failed');

      const colRef = collection(
        db,
        'artifacts',
        'hyundai-sales-to-service',
        'public',
        'data',
        'recallCampaignLeads'
      );
      const now = new Date().toISOString();
      for (let i = 0; i < result.results.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const row of result.results.slice(i, i + BATCH_SIZE)) {
          if (!row.success) continue;
          const lead = recipients.find((l) => l.id === row.id);
          if (!lead) continue;
          batch.update(doc(colRef, lead.id), {
            outreachStatus: channel === 'sms' ? 'text_sent' : 'email_sent',
            lastOutreachAt: now,
            lastOutreachChannel: channel,
          });
        }
        await batch.commit();
      }

      notify(`Sent ${result.sent} message(s). ${result.failed} failed.`);
      clearSelection();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Bulk send failed', true);
    } finally {
      setSending(false);
    }
  };

  const handleBulkSend = async () => {
    const selected = leads.filter((l) => selectedIds.has(l.id));
    await sendToRecipients(selected, outreachChannel);
  };

  const handleSendToAll = async (channel: 'sms' | 'email') => {
    const pool =
      channel === 'sms'
        ? leads.filter((l) => l.phone)
        : leads.filter((l) => l.email);
    if (
      !window.confirm(
        `Send ${channel === 'sms' ? 'SMS' : 'email'} to ALL ${pool.length} customers with ${channel === 'sms' ? 'a phone number' : 'an email'}?`
      )
    ) {
      return;
    }
    await sendToRecipients(pool, channel);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Remove ${selectedIds.size} selected recall entries from this list?`)) return;
    const colRef = collection(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'recallCampaignLeads'
    );
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      ids.slice(i, i + BATCH_SIZE).forEach((id) => batch.delete(doc(colRef, id)));
      await batch.commit();
    }
    clearSelection();
    notify('Selected entries removed.');
  };

  const personalizePreview = (lead: RecallCampaignLead) =>
    message
      .replace(/\{name\}/gi, lead.customerName || 'Owner')
      .replace(/\{customer\}/gi, lead.customerName || 'Owner')
      .replace(/\{year\}/gi, lead.year || '')
      .replace(/\{make\}/gi, lead.make || '')
      .replace(/\{model\}/gi, lead.model || '')
      .replace(/\{campaign\}/gi, lead.campaignNumber || '');

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleImportPdf}
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-400" />
            Pending Recall Outreach
          </h3>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
            Import OEM recall lists — no customer profiles created
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setManualFormOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 border border-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
          >
            <Plus size={14} />
            Add Customer
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
            Import Recall PDF
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p>{loadError}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: Users },
          { label: 'With Phone', value: stats.withPhone, icon: Phone },
          { label: 'With Email', value: stats.withEmail, icon: Mail },
          { label: 'Contacted', value: stats.contacted, icon: Send },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Icon size={12} />
              <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
            </div>
            <p className="text-2xl font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
        <div>
          <h4 className="text-sm font-black text-white uppercase tracking-widest">Outreach message</h4>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
            Edit the text sent to customers by SMS or email. Use {'{name}'}, {'{year}'}, {'{make}'}, {'{model}'}, {'{campaign}'}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOutreachChannel('sms')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border',
              outreachChannel === 'sms'
                ? 'bg-brand-primary/20 border-brand-primary text-brand-primary'
                : 'border-slate-700 text-slate-400'
            )}
          >
            Text SMS
          </button>
          <button
            type="button"
            onClick={() => setOutreachChannel('email')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border',
              outreachChannel === 'email'
                ? 'bg-brand-primary/20 border-brand-primary text-brand-primary'
                : 'border-slate-700 text-slate-400'
            )}
          >
            Email
          </button>
          {!smsConfigured && outreachChannel === 'sms' && (
            <span className="text-[9px] text-amber-500 font-bold uppercase self-center">
              Twilio not configured on server
            </span>
          )}
          {!emailConfigured && outreachChannel === 'email' && (
            <span className="text-[9px] text-amber-500 font-bold uppercase self-center">
              SendGrid not configured on server
            </span>
          )}
        </div>

        {outreachChannel === 'email' && (
          <input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
            placeholder="Email subject"
          />
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white resize-y"
          placeholder="Message template. Use {name}, {year}, {make}, {model}, {campaign}"
        />

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={selectAllFiltered} className="toolbar-btn">
            Select All
          </button>
          <button type="button" onClick={selectWithPhone} className="toolbar-btn">
            With Phone
          </button>
          <button type="button" onClick={selectWithEmail} className="toolbar-btn">
            With Email
          </button>
          <button type="button" onClick={clearSelection} className="toolbar-btn">
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleSendToAll('sms')}
            disabled={sending || stats.withPhone === 0}
            className="toolbar-btn text-emerald-400 border-emerald-500/30"
          >
            Text ALL ({stats.withPhone})
          </button>
          <button
            type="button"
            onClick={() => handleSendToAll('email')}
            disabled={sending || stats.withEmail === 0}
            className="toolbar-btn text-sky-400 border-sky-500/30"
          >
            Email ALL ({stats.withEmail})
          </button>
          <button
            type="button"
            onClick={handleBulkSend}
            disabled={sending || selectedIds.size === 0}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
          >
            {sending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : outreachChannel === 'sms' ? (
              <MessageSquare size={12} />
            ) : (
              <Mail size={12} />
            )}
            Send to {selectedIds.size} selected
          </button>
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 bg-rose-950/40 border border-rose-500/30 text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
          >
            <Trash2 size={12} />
            Remove
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search name, VIN, phone, email..."
          className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white"
        />
      </div>

      {loading ? (
        <div className="py-16 text-center border border-slate-800 rounded-3xl">
          <Loader2 className="animate-spin text-brand-secondary mx-auto mb-3" size={28} />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Loading recall list...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-3xl">
          <ShieldAlert size={40} className="mx-auto text-slate-700 mb-3" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
            No pending recall list imported yet
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 text-brand-primary text-[10px] font-black uppercase tracking-widest hover:underline"
          >
            Import Recall PDF
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs min-w-[900px]">
            <thead>
              <tr className="bg-slate-950/80 text-[9px] uppercase text-slate-500">
                <th className="p-3 w-10" />
                <th className="p-3">Customer</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Email</th>
                <th className="p-3">VIN</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Campaign</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const selected = selectedIds.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className={cn(
                      'border-t border-slate-800/80 hover:bg-slate-900/40',
                      selected && 'bg-brand-primary/5'
                    )}
                  >
                    <td className="p-3">
                      <button type="button" onClick={() => toggleSelect(lead.id)}>
                        {selected ? (
                          <CheckSquare size={16} className="text-brand-primary" />
                        ) : (
                          <Square size={16} className="text-slate-600" />
                        )}
                      </button>
                    </td>
                    <td className="p-3 font-bold text-white">{lead.customerName || '—'}</td>
                    <td className="p-3 font-mono text-slate-300">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="hover:text-brand-secondary">
                          {lead.phone.replace(/^\+1/, '')}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-slate-300 max-w-[160px] truncate">
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="hover:text-brand-secondary">
                          {lead.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 font-mono text-[10px] text-slate-400">{lead.vin}</td>
                    <td className="p-3 text-slate-300">
                      {[lead.year, lead.make, lead.model].filter(Boolean).join(' ')}
                    </td>
                    <td className="p-3 font-mono text-brand-secondary">{lead.campaignNumber}</td>
                    <td className="p-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[8px] font-black uppercase',
                          lead.outreachStatus === 'pending' && 'bg-amber-500/10 text-amber-400',
                          lead.outreachStatus === 'text_sent' && 'bg-emerald-500/10 text-emerald-400',
                          lead.outreachStatus === 'email_sent' && 'bg-sky-500/10 text-sky-400',
                          lead.outreachStatus === 'no_contact' && 'bg-slate-700/50 text-slate-500'
                        )}
                      >
                        {lead.outreachStatus.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedIds.size === 1 && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400"
          >
            <p className="text-[9px] font-black uppercase text-slate-500 mb-2">Message preview</p>
            {personalizePreview(leads.find((l) => selectedIds.has(l.id))!)}
          </motion.div>
        </AnimatePresence>
      )}

      <RecallManualAddForm
        open={manualFormOpen}
        onClose={() => setManualFormOpen(false)}
        onSave={saveSingleLead}
        defaultCampaign={defaultCampaign}
      />

      <style>{`
        .toolbar-btn {
          padding: 0.375rem 0.75rem;
          border-radius: 0.5rem;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border: 1px solid rgb(51 65 85);
          color: rgb(148 163 184);
        }
        .toolbar-btn:hover { color: white; border-color: rgb(100 116 139); }
      `}</style>
    </div>
  );
}
