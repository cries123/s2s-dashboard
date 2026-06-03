import React, { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { normalizeRecallEmail, normalizeRecallPhone } from '../../../lib/recallCampaignParser';

export interface ManualRecallLeadInput {
  customerName: string;
  phone: string;
  email: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  campaignNumber: string;
}

interface RecallManualAddFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (lead: ManualRecallLeadInput) => Promise<void>;
  defaultCampaign?: string;
}

const emptyForm = (campaign = '9C2'): ManualRecallLeadInput => ({
  customerName: '',
  phone: '',
  email: '',
  vin: '',
  year: '',
  make: 'Hyundai',
  model: '',
  campaignNumber: campaign,
});

export function RecallManualAddForm({
  open,
  onClose,
  onSave,
  defaultCampaign = '9C2',
}: RecallManualAddFormProps) {
  const [form, setForm] = useState<ManualRecallLeadInput>(() => emptyForm(defaultCampaign));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const update = (key: keyof ManualRecallLeadInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const vin = form.vin.trim().toUpperCase();
    if (vin.length !== 17) {
      setError('VIN must be 17 characters.');
      return;
    }
    if (!form.customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!normalizeRecallPhone(form.phone) && !normalizeRecallEmail(form.email)) {
      setError('Enter a valid phone or email.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...form,
        customerName: form.customerName.trim(),
        vin,
        campaignNumber: form.campaignNumber.trim() || defaultCampaign,
        phone: form.phone.trim(),
        email: form.email.trim(),
      });
      setForm(emptyForm(defaultCampaign));
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Add Recall Customer</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <Field label="Customer name" value={form.customerName} onChange={(v) => update('customerName', v)} required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={form.phone} onChange={(v) => update('phone', v)} placeholder="805-555-0100" />
            <Field label="Email" value={form.email} onChange={(v) => update('email', v)} placeholder="name@email.com" />
          </div>
          <Field label="VIN (17 chars)" value={form.vin} onChange={(v) => update('vin', v.toUpperCase())} required maxLength={17} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Year" value={form.year} onChange={(v) => update('year', v)} placeholder="2020" />
            <Field label="Make" value={form.make} onChange={(v) => update('make', v)} />
            <Field label="Model" value={form.model} onChange={(v) => update('model', v)} placeholder="SANTA FE" />
          </div>
          <Field label="Campaign #" value={form.campaignNumber} onChange={(v) => update('campaignNumber', v)} />

          {error && (
            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wide">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest',
              'bg-brand-primary text-white disabled:opacity-50'
            )}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add to recall list
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white"
      />
    </label>
  );
}
