import React, { useEffect, useState } from 'react';
import { CalendarCheck, Loader2 } from 'lucide-react';
import { CONTACT_OUTCOMES } from '../../lib/contactOutcomes';
import { cn } from '../../lib/utils';

export interface ContactLogFormValues {
  outcome: string;
  notes: string;
  appointmentSet: boolean;
}

interface ContactLogQuickFormProps {
  defaultOutcome: string;
  autoCheckAppointmentSet: boolean;
  onSubmit: (values: ContactLogFormValues) => Promise<void>;
  submitLabel?: string;
  className?: string;
}

export function ContactLogQuickForm({
  defaultOutcome,
  autoCheckAppointmentSet,
  onSubmit,
  submitLabel = 'Save contact log',
  className,
}: ContactLogQuickFormProps) {
  const [outcome, setOutcome] = useState(defaultOutcome);
  const [notes, setNotes] = useState('');
  const [appointmentSet, setAppointmentSet] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  useEffect(() => {
    setOutcome(defaultOutcome);
  }, [defaultOutcome]);

  useEffect(() => {
    if (autoCheckAppointmentSet && outcome === 'Appointment Set') {
      setAppointmentSet(true);
    }
  }, [outcome, autoCheckAppointmentSet]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLogging(true);
    try {
      await onSubmit({ outcome, notes, appointmentSet });
      setNotes('');
      setAppointmentSet(false);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-3', className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">
            Outcome
          </label>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
          >
            {CONTACT_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={appointmentSet}
            onChange={(e) => setAppointmentSet(e.target.checked)}
            className="rounded border-slate-600"
          />
          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
            <CalendarCheck size={12} /> Appointment set
          </span>
        </label>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Call notes…"
        rows={2}
        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 resize-none"
      />
      <button
        type="submit"
        disabled={isLogging}
        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLogging ? <Loader2 size={14} className="animate-spin" /> : null}
        {submitLabel}
      </button>
    </form>
  );
}
