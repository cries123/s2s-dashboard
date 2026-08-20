import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckSquare,
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
import { auth, db } from '../../../firebase';
import { cn } from '../../../lib/utils';
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
const BULK_OUTREACH_CHUNK = 200;

interface OutreachStatus {
  smsConfigured: boolean;
  emailConfigured: boolean;
}

interface BulkOutreachResult {
  id: string;
  success: boolean;
  error?: string;
}

async function getOutreachBearerHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to send outreach messages.');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function personalizeMessage(template: string, lead: RecallCampaignLead): string {
  return template
    .replace(/\{name\}/gi, lead.customerName || 'Owner')
    .replace(/\{customer\}/gi, lead.customerName || 'Owner')
    .replace(/\{year\}/gi, lead.year || '')
    .replace(/\{make\}/gi, lead.make || '')
    .replace(/\{model\}/gi, lead.model || '')
    .replace(/\{campaign\}/gi, lead.campaignNumber || '');
}

function buildSmsLink(phone: string, body: string): string {
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return `sms:${e164}?body=${encodeURIComponent(body)}`;
}

function buildMailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function RecallCampaignOutreach({
  currentDealershipId,
  currentUserId,
  onNotify,
}: RecallCampaignOutreachProps) {
  const [leads, setLeads] = useState<RecallCampaignLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(DEFAULT_SMS_TEMPLATE);
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [outreachChannel, setOutreachChannel] = useState<'sms' | 'email'>('sms');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [defaultCampaign, setDefaultCampaign] = useState('9C2');
  const [outreachStatus, setOutreachStatus] = useState<OutreachStatus | null>(null);

  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const notify = useCallback((text: string, isError = false) => {
    onNotifyRef.current?.(text, isError);
  }, []);

  useEffect(() => {
    if (!currentDealershipId) {
      setLoading(false);
      return;
    }

    setLoadError(null);

    // Firestore security rules require an explicit dealershipId match to list this
    // collection (no more open collection-wide reads across tenants).
    const colRef = query(
      collection(
        db,
        'artifacts',
        'hyundai-sales-to-service',
        'public',
        'data',
        'recallCampaignLeads'
      ),
      where('dealershipId', '==', currentDealershipId || 'hyundai')
    );

    const applyRows = (docs: { id: string; data: () => Record<string, unknown> }[]) => {
      const rows = docs.map((d) => ({ id: d.id, ...d.data() }) as RecallCampaignLead);
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
        setLeads([]);
        setLoadError(
          'Could not load recall list. Deploy Firestore rules for recallCampaignLeads, then refresh.'
        );
      }
    );

    return () => {
      window.clearTimeout(timeout);
      unsub();
    };
  }, [currentDealershipId]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/outreach/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { smsConfigured?: boolean; emailConfigured?: boolean } | null) => {
        if (!cancelled && data) {
          setOutreachStatus({
            smsConfigured: !!data.smsConfigured,
            emailConfigured: !!data.emailConfigured,
          });
        }
      })
      .catch(() => {
        // Leave outreachStatus as null — send flows fall back to the manual
        // copy + native-app path when server-side status is unknown.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const markLeadsContacted = async (leadIds: string[], channel: 'sms' | 'email') => {
    if (leadIds.length === 0) return;
    const colRef = collection(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'recallCampaignLeads'
    );
    const now = new Date().toISOString();
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const id of leadIds.slice(i, i + BATCH_SIZE)) {
        batch.update(doc(colRef, id), {
          outreachStatus: channel === 'sms' ? 'text_sent' : 'email_sent',
          lastOutreachAt: now,
          lastOutreachChannel: channel,
        });
      }
      await batch.commit();
    }
  };

  const openNativeOutreach = async (lead: RecallCampaignLead, channel: 'sms' | 'email') => {
    const body = personalizeMessage(message, lead);
    if (channel === 'sms') {
      if (!lead.phone) {
        notify('No phone number for this customer.', true);
        return;
      }
      window.location.href = buildSmsLink(lead.phone, body);
    } else {
      if (!lead.email) {
        notify('No email for this customer.', true);
        return;
      }
      window.location.href = buildMailtoLink(lead.email, emailSubject, body);
    }
    await markLeadsContacted([lead.id], channel);
    notify(`Opened ${channel === 'sms' ? 'Messages' : 'email'} for ${lead.customerName}.`);
  };

  const copyOutreachList = async (pool: RecallCampaignLead[], channel: 'sms' | 'email') => {
    const lines = pool.map((l) => {
      const contact = channel === 'sms' ? l.phone : l.email;
      return `${l.customerName}\t${contact}`;
    });
    const clipboardText = `${message}\n\n---\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(clipboardText);
      notify(`Copied message and ${pool.length} contacts to clipboard.`);
    } catch {
      notify('Could not copy to clipboard. Use per-row Text/Email buttons instead.', true);
    }
  };

  /**
   * Sends the outreach message to every recipient in `pool` via the
   * authenticated server endpoint (real SMS/email through Twilio/SendGrid),
   * chunked to respect the endpoint's 200-recipient-per-request limit.
   * Only recipients the server reports as successfully sent are marked
   * contacted — a failed send is never marked as contacted.
   */
  const sendBulkOutreach = async (
    pool: RecallCampaignLead[],
    channel: 'sms' | 'email'
  ): Promise<{ sent: number; failed: number }> => {
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < pool.length; i += BULK_OUTREACH_CHUNK) {
      const chunk = pool.slice(i, i + BULK_OUTREACH_CHUNK);
      const headers = await getOutreachBearerHeaders();
      const recipients = chunk.map((l) => ({
        id: l.id,
        customerName: l.customerName,
        phone: l.phone,
        email: l.email,
        year: l.year,
        make: l.make,
        model: l.model,
        campaignNumber: l.campaignNumber,
      }));

      const res = await fetch('/api/outreach/bulk', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          channel,
          message,
          subject: channel === 'email' ? emailSubject : undefined,
          recipients,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.error) || `Bulk outreach failed (${res.status})`);
      }

      const results: BulkOutreachResult[] = data?.results || [];
      const successIds = results.filter((r) => r.success).map((r) => r.id);
      if (successIds.length > 0) {
        await markLeadsContacted(successIds, channel);
      }
      sent += typeof data?.sent === 'number' ? data.sent : successIds.length;
      failed += typeof data?.failed === 'number' ? data.failed : results.length - successIds.length;
    }

    return { sent, failed };
  };

  const sendToRecipients = async (recipients: RecallCampaignLead[], channel: 'sms' | 'email') => {
    const pool = recipients.filter((l) => (channel === 'sms' ? l.phone : l.email));
    if (pool.length === 0) {
      notify('No customers match this send action.', true);
      return;
    }

    setSending(true);
    try {
      if (pool.length === 1) {
        await openNativeOutreach(pool[0]!, channel);
        clearSelection();
        return;
      }

      const channelConfigured =
        channel === 'sms' ? outreachStatus?.smsConfigured : outreachStatus?.emailConfigured;

      if (channelConfigured) {
        const { sent, failed } = await sendBulkOutreach(pool, channel);
        notify(
          failed > 0
            ? `Sent ${sent} of ${pool.length} messages. ${failed} failed to send and were NOT marked as contacted.`
            : `Sent ${sent} of ${pool.length} messages successfully.`,
          failed > 0
        );
        clearSelection();
        return;
      }

      // Fallback for dealerships without Twilio/SendGrid configured server-side:
      // copy the message + contact list, open the native app for the first
      // recipient, and let the user confirm they manually messaged the rest.
      await copyOutreachList(pool, channel);
      await openNativeOutreach(pool[0]!, channel);

      if (
        window.confirm(
          `${channel === 'sms' ? 'SMS' : 'Email'} sending isn't configured on the server, so only the first customer was opened in your ${channel === 'sms' ? 'Messages' : 'email'} app. The message and full contact list were copied to your clipboard. Mark all ${pool.length} as contacted after you finish messaging everyone yourself?`
        )
      ) {
        await markLeadsContacted(
          pool.map((l) => l.id),
          channel
        );
      }
      clearSelection();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Outreach failed', true);
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
    const channelConfigured =
      channel === 'sms' ? outreachStatus?.smsConfigured : outreachStatus?.emailConfigured;
    const confirmMessage = channelConfigured
      ? `Send ${channel === 'sms' ? 'SMS' : 'email'} to ALL ${pool.length} customers with ${channel === 'sms' ? 'a phone number' : 'an email'}?`
      : `${channel === 'sms' ? 'SMS' : 'Email'} sending isn't configured on the server. This will open your ${channel === 'sms' ? 'Messages' : 'email'} app for the FIRST customer only and copy the rest of the ${pool.length} contacts to your clipboard to message manually. Continue?`;
    if (!window.confirm(confirmMessage)) {
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
    const ids: string[] = [...selectedIds];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const id of ids.slice(i, i + BATCH_SIZE)) {
        batch.delete(doc(colRef, id));
      }
      await batch.commit();
    }
    clearSelection();
    notify('Selected entries removed.');
  };

  const personalizePreview = (lead: RecallCampaignLead) => personalizeMessage(message, lead);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-400" />
            Pending Recall Outreach
          </h3>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
            Add OEM recall customers — bulk sends go out via Twilio/SendGrid when configured,
            otherwise text/email via your phone or mail app
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setManualFormOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-primary/90"
          >
            <Plus size={14} />
            Add Customer
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
            className="p-4 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Icon size={12} />
              <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="p-5 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
        <div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Outreach message</h4>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
            Edit the message opened in your Messages or email app. Use {'{name}'}, {'{year}'}, {'{make}'}, {'{model}'}, {'{campaign}'}.
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
                : 'border-slate-300 dark:border-slate-700 text-slate-400'
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
                : 'border-slate-300 dark:border-slate-700 text-slate-400'
            )}
          >
            Email
          </button>
        </div>

        {outreachChannel === 'email' && (
          <input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white"
            placeholder="Email subject"
          />
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white resize-y"
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
            onClick={() => {
              const pool =
                outreachChannel === 'sms'
                  ? filteredLeads.filter((l) => l.phone)
                  : filteredLeads.filter((l) => l.email);
              void copyOutreachList(pool, outreachChannel);
            }}
            className="toolbar-btn"
          >
            Copy list
          </button>
          <button
            type="button"
            onClick={() => handleSendToAll('sms')}
            disabled={sending || stats.withPhone === 0}
            className="toolbar-btn text-emerald-400 border-emerald-500/30"
          >
            Text ALL on my phone ({stats.withPhone})
          </button>
          <button
            type="button"
            onClick={() => handleSendToAll('email')}
            disabled={sending || stats.withEmail === 0}
            className="toolbar-btn text-sky-400 border-sky-500/30"
          >
            Email ALL in my app ({stats.withEmail})
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
          className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white"
        />
      </div>

      {loading && leads.length === 0 && (
        <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
          <Loader2 className="animate-spin" size={14} />
          Loading recall list...
        </div>
      )}

      {!loading && leads.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-3xl">
          <ShieldAlert size={40} className="mx-auto text-slate-700 mb-3" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
            No pending recall list yet
          </p>
          <button
            type="button"
            onClick={() => setManualFormOpen(true)}
            className="mt-3 text-brand-primary text-[10px] font-black uppercase tracking-widest hover:underline"
          >
            Add Customer
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs min-w-[900px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-950/80 text-[9px] uppercase text-slate-500">
                <th className="p-3 w-10" />
                <th className="p-3">Customer</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Email</th>
                <th className="p-3">VIN</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Campaign</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const selected = selectedIds.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className={cn(
                      'border-t border-slate-200 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-900/40',
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
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{lead.customerName || '—'}</td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="hover:text-brand-secondary">
                          {lead.phone.replace(/^\+1/, '')}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 max-w-[160px] truncate">
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="hover:text-brand-secondary">
                          {lead.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 font-mono text-[10px] text-slate-400">{lead.vin}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
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
                          lead.outreachStatus === 'no_contact' && 'bg-slate-200 dark:bg-slate-700/50 text-slate-500'
                        )}
                      >
                        {lead.outreachStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {lead.phone && (
                          <button
                            type="button"
                            title="Text on my phone"
                            onClick={() => void openNativeOutreach(lead, 'sms')}
                            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-emerald-400 hover:bg-emerald-500/10"
                          >
                            <MessageSquare size={12} />
                          </button>
                        )}
                        {lead.email && (
                          <button
                            type="button"
                            title="Email in my app"
                            onClick={() => void openNativeOutreach(lead, 'email')}
                            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sky-400 hover:bg-sky-500/10"
                          >
                            <Mail size={12} />
                          </button>
                        )}
                      </div>
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
            className="p-4 bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-400"
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
          border: 1px solid var(--color-surface-border);
          color: var(--color-text-secondary);
        }
        .toolbar-btn:hover { color: var(--color-text-primary); border-color: var(--color-text-tertiary); }
      `}</style>
    </div>
  );
}
