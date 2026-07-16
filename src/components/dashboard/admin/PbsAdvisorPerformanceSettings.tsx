import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, Trophy, KeyRound } from 'lucide-react';
import {
  getDealershipStaffConfig,
  slugifyStaffName,
  type PerformanceAdvisorSlot,
} from '../../../lib/dealershipStaff';
import { defaultPbsAdvisorCodeMap, mergePbsAdvisorCodeMaps } from '../../../constants/pbsAdvisorDefaults';
import type { DealershipSettings } from '../../../types';

interface CodeMapRow {
  code: string;
  name: string;
}

interface PbsAdvisorPerformanceSettingsProps {
  dealershipId: string;
  settings: Partial<DealershipSettings>;
  unmatchedAdvisorNames?: string[];
  onUpdate: (patch: Record<string, unknown>) => void;
}

function toCodeMapRows(map: Record<string, string>): CodeMapRow[] {
  return Object.entries(map).map(([code, name]) => ({ code, name }));
}

export function PbsAdvisorPerformanceSettings({
  dealershipId,
  settings,
  unmatchedAdvisorNames = [],
  onUpdate,
}: PbsAdvisorPerformanceSettingsProps) {
  const staffConfig = getDealershipStaffConfig(dealershipId, settings);
  const [roster, setRoster] = useState<PerformanceAdvisorSlot[]>(staffConfig.performanceAdvisorRoster);
  const mergedCodeMap = useMemo(
    () =>
      mergePbsAdvisorCodeMaps(
        defaultPbsAdvisorCodeMap(dealershipId),
        settings.pbsAdvisorCodeMap as Record<string, string> | undefined
      ),
    [dealershipId, settings.pbsAdvisorCodeMap]
  );
  const [codeRows, setCodeRows] = useState<CodeMapRow[]>(() => toCodeMapRows(mergedCodeMap));

  useEffect(() => {
    setRoster(staffConfig.performanceAdvisorRoster);
  }, [dealershipId, settings.performanceAdvisorRoster]);

  useEffect(() => {
    setCodeRows(toCodeMapRows(mergedCodeMap));
  }, [mergedCodeMap]);

  const saveRoster = () => {
    if (!roster.length) return;
    onUpdate({ performanceAdvisorRoster: roster });
  };

  const saveCodeMap = () => {
    const custom: Record<string, string> = {};
    const defaults = defaultPbsAdvisorCodeMap(dealershipId);
    for (const row of codeRows) {
      const code = row.code.trim().toLowerCase();
      const name = row.name.trim();
      if (!code || !name) continue;
      if (defaults[code] === name) continue;
      custom[code] = name;
    }
    onUpdate({ pbsAdvisorCodeMap: custom });
  };

  const suggestedCodes = unmatchedAdvisorNames.filter(
    (name) => !codeRows.some((row) => row.code.toLowerCase() === name.toLowerCase())
  );

  return (
    <div className="space-y-6 pt-4 border-t border-white/5">
      <div className="space-y-3">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
          <Trophy size={12} className="text-brand-primary" />
          Operations advisor roster
        </label>
        <p className="text-[10px] text-slate-500 max-w-2xl leading-relaxed">
          Advisors shown on the Operations performance breakdown. PBS login codes must map to one of
          these names.
        </p>
        <div className="space-y-2 max-w-lg">
          {roster.map((row, idx) => (
            <div key={`${row.id}-${idx}`} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={row.label}
                onChange={(e) => {
                  const label = e.target.value;
                  setRoster((prev) => {
                    const next = [...prev];
                    next[idx] = {
                      ...next[idx],
                      label,
                      id: slugifyStaffName(label) || next[idx].id,
                    };
                    return next;
                  });
                }}
                placeholder="Display name"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
              <button
                type="button"
                onClick={() => setRoster((prev) => prev.filter((_, i) => i !== idx))}
                className="text-[10px] font-black uppercase text-rose-400 px-2"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setRoster((prev) => [
                ...prev,
                { id: `advisor_${prev.length + 1}`, label: `Advisor ${prev.length + 1}` },
              ])
            }
            className="inline-flex items-center gap-1 px-4 py-2 bg-slate-800 text-[10px] font-black uppercase rounded-xl text-white"
          >
            <Plus size={12} />
            Add advisor
          </button>
          <button
            type="button"
            onClick={saveRoster}
            className="inline-flex items-center gap-1 px-4 py-2 bg-brand-primary/20 text-brand-primary text-[10px] font-black uppercase rounded-xl border border-brand-primary/30"
          >
            <Save size={12} />
            Save roster
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-white/5">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
          <KeyRound size={12} className="text-brand-primary" />
          PBS login code map
        </label>
        <p className="text-[10px] text-slate-500 max-w-2xl leading-relaxed">
          When PBS puts a login code in the CSR field (e.g. <strong className="text-slate-300">LV4278</strong>
          ), map it to the advisor name on your roster. After saving, run{' '}
          <strong className="text-slate-300">Admin → PBS Sync → Pull changes</strong> to rebuild the
          breakdown.
        </p>

        {suggestedCodes.length > 0 ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3 text-[11px] text-amber-200/90">
            Unmapped PBS names from the last sync:{' '}
            <strong className="text-amber-100">{suggestedCodes.join(', ')}</strong>. Add a row below
            for each code, then pull changes again.
          </div>
        ) : null}

        <div className="space-y-2 max-w-lg">
          {codeRows.map((row, idx) => (
            <div key={`${row.code}-${idx}`} className="flex flex-col sm:flex-row gap-2 items-stretch">
              <input
                type="text"
                value={row.code}
                onChange={(e) => {
                  const code = e.target.value;
                  setCodeRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], code };
                    return next;
                  });
                }}
                placeholder="PBS code (LV4278)"
                className="w-full sm:w-36 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 uppercase"
              />
              <input
                type="text"
                value={row.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setCodeRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], name };
                    return next;
                  });
                }}
                placeholder="Advisor name (Lemmy)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
              <button
                type="button"
                onClick={() => setCodeRows((prev) => prev.filter((_, i) => i !== idx))}
                className="px-2 text-rose-400"
                aria-label="Remove code map row"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCodeRows((prev) => [...prev, { code: '', name: '' }])}
            className="inline-flex items-center gap-1 px-4 py-2 bg-slate-800 text-[10px] font-black uppercase rounded-xl text-white"
          >
            <Plus size={12} />
            Add code
          </button>
          {suggestedCodes.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setCodeRows((prev) => [
                  ...prev,
                  ...suggestedCodes.map((code) => ({ code, name: '' })),
                ])
              }
              className="px-4 py-2 bg-amber-500/10 text-amber-300 text-[10px] font-black uppercase rounded-xl border border-amber-500/20"
            >
              Add unmapped codes
            </button>
          ) : null}
          <button
            type="button"
            onClick={saveCodeMap}
            className="inline-flex items-center gap-1 px-4 py-2 bg-brand-primary/20 text-brand-primary text-[10px] font-black uppercase rounded-xl border border-brand-primary/30"
          >
            <Save size={12} />
            Save code map
          </button>
        </div>
      </div>
    </div>
  );
}

export default PbsAdvisorPerformanceSettings;
