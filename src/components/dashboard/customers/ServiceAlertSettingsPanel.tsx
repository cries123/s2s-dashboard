import React, { useEffect, useState } from 'react';
import { Bell, Loader2, Save } from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  clampServiceAlertBufferDays,
  clampServiceAlertIntervalDays,
  DEFAULT_SERVICE_ALERT_BUFFER_DAYS,
  DEFAULT_SERVICE_ALERT_INTERVAL_DAYS,
  serviceAlertIntervalMonths,
} from '../../../lib/dealershipSettingsUtils';

interface ServiceAlertSettingsPanelProps {
  dealershipId: string;
  dealershipName: string;
  intervalDays: number;
  bufferDays: number;
  canEdit: boolean;
  onSaved?: (message: string) => void;
  onError?: (message: string) => void;
}

export function ServiceAlertSettingsPanel({
  dealershipId,
  dealershipName,
  intervalDays,
  bufferDays,
  canEdit,
  onSaved,
  onError,
}: ServiceAlertSettingsPanelProps) {
  const [localInterval, setLocalInterval] = useState(intervalDays);
  const [localBuffer, setLocalBuffer] = useState(bufferDays);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalInterval(intervalDays);
    setLocalBuffer(bufferDays);
  }, [intervalDays, bufferDays, dealershipId]);

  const hasChanges =
    localInterval !== intervalDays || localBuffer !== bufferDays;

  const handleSave = async () => {
    if (!canEdit || !dealershipId) return;

    const nextInterval = clampServiceAlertIntervalDays(localInterval);
    const nextBuffer = clampServiceAlertBufferDays(localBuffer);

    setSaving(true);
    try {
      const settingsRef = doc(
        db,
        'artifacts',
        'hyundai-sales-to-service',
        'public',
        'data',
        'dealershipSettings',
        dealershipId
      );
      await updateDoc(settingsRef, {
        serviceAlertIntervalDays: nextInterval,
        serviceAlertBufferDays: nextBuffer,
        updatedAt: serverTimestamp(),
      });
      setLocalInterval(nextInterval);
      setLocalBuffer(nextBuffer);
      onSaved?.(`Service alert timing updated for ${dealershipName}.`);
    } catch (err) {
      console.error('[ServiceAlertSettings] Save failed:', err);
      onError?.('Could not save service alert settings. Try again or use Admin → Operations.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-base p-4 sm:p-5 border border-slate-800/80 bg-slate-900/50 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
          <Bell size={16} className="text-indigo-400" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">Service alert timing</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Controls when customers appear in Service Alerts for{' '}
            <span className="text-slate-300 font-medium">{dealershipName}</span>.
            Increase the interval if alerts are firing too soon.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
            Minimum days between service
          </span>
          <input
            type="number"
            min={30}
            max={730}
            disabled={!canEdit}
            value={localInterval}
            onChange={(e) =>
              setLocalInterval(Number(e.target.value) || DEFAULT_SERVICE_ALERT_INTERVAL_DAYS)
            }
            className="input-field w-full font-mono tabular-nums disabled:opacity-60"
          />
          <span className="text-[10px] text-slate-500">
            ≈ {serviceAlertIntervalMonths(localInterval)} months · default{' '}
            {DEFAULT_SERVICE_ALERT_INTERVAL_DAYS} days
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
            Extra buffer days after due
          </span>
          <input
            type="number"
            min={0}
            max={60}
            disabled={!canEdit}
            value={localBuffer}
            onChange={(e) =>
              setLocalBuffer(Number(e.target.value) || DEFAULT_SERVICE_ALERT_BUFFER_DAYS)
            }
            className="input-field w-full font-mono tabular-nums disabled:opacity-60"
          />
          <span className="text-[10px] text-slate-500">
            Wait this many days after the due date before showing the alert (0–60).
          </span>
        </label>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !hasChanges}
            className="btn-primary text-xs py-2.5 px-4 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save alert timing
          </button>
          {hasChanges ? (
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
              Unsaved changes
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-[10px] text-slate-500">
          Managers and administrators can adjust these values. Current: every{' '}
          <span className="text-slate-300 font-mono">{intervalDays}</span> days
          {bufferDays > 0 ? (
            <>
              {' '}
              + <span className="text-slate-300 font-mono">{bufferDays}</span> day buffer
            </>
          ) : null}
          .
        </p>
      )}
    </div>
  );
}
