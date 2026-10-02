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
          <label htmlFor="contactlog-outcome" className="text-xs font-semibold text-slate-500 mb-1 block">
            Outcome
          </label>
          <select id="contactlog-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="input-field"
          >
            {CONTACT_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={appointmentSet}
            onChange={(e) => setAppointmentSet(e.target.checked)}
            className="tap-expand w-5 h-5 rounded accent-[var(--color-brand-primary)]"
          />
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
            <CalendarCheck size={12} /> Appointment set
          </span>
        </label>
      </div>
      <textarea
        aria-label="Call notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Call notes…"
        rows={2}
        className="input-field resize-none"
      />
      <button
        type="submit"
        disabled={isLogging}
        className="btn-primary w-full sm:w-auto sm:px-6"
      >
        {isLogging ? <Loader2 size={14} className="animate-spin" /> : null}
        {submitLabel}
      </button>
    </form>
  );
}
