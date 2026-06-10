import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { Lightbulb, Loader2, CheckCircle2, Eye, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { Suggestion, SuggestionStatus } from '../../../types';
import { DEALERSHIPS } from '../../../constants';

const SUGGESTIONS_PATH = 'artifacts/hyundai-sales-to-service/public/data/suggestions';

function formatWhen(ts?: { toDate?: () => Date }): string {
  return ts?.toDate?.()?.toLocaleString?.() || '—';
}

function statusBadge(status: SuggestionStatus) {
  const styles: Record<SuggestionStatus, string> = {
    new: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    reviewed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
  return (
    <span
      className={cn(
        'px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border',
        styles[status]
      )}
    >
      {status}
    </span>
  );
}

export function SuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | SuggestionStatus>('all');

  useEffect(() => {
    const ref = collection(db, SUGGESTIONS_PATH);
    const q = query(ref, orderBy('createdAt', 'desc'), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSuggestions(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Suggestion[]
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const updateStatus = async (id: string, status: SuggestionStatus) => {
    try {
      await updateDoc(doc(db, SUGGESTIONS_PATH, id), {
        status,
        reviewedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to update suggestion:', err);
    }
  };

  const removeSuggestion = async (id: string) => {
    if (!window.confirm('Delete this suggestion permanently?')) return;
    try {
      await deleteDoc(doc(db, SUGGESTIONS_PATH, id));
    } catch (err) {
      console.error('Failed to delete suggestion:', err);
    }
  };

  const filtered = suggestions.filter((s) => filter === 'all' || s.status === filter);
  const newCount = suggestions.filter((s) => s.status === 'new').length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-brand-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand-primary text-[9px] font-black uppercase tracking-[0.25em]">
            <Lightbulb size={12} />
            User suggestions
          </div>
          <p className="text-xs text-slate-500 max-w-2xl mt-1">
            Feedback submitted from the lightbulb icon in the top bar.
            {newCount > 0 ? ` ${newCount} new.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'new', 'reviewed', 'resolved'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors',
                filter === id
                  ? 'bg-brand-primary text-slate-950 border-brand-primary'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              )}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card-base border border-white/5 p-12 text-center text-slate-500 text-sm">
            No suggestions yet.
          </div>
        ) : (
          filtered.map((s) => {
            const store =
              s.dealershipName ||
              DEALERSHIPS.find((d) => d.id === s.dealershipId)?.name ||
              s.dealershipId;
            return (
              <div
                key={s.id}
                className="card-base border border-white/5 p-5 space-y-3 hover:border-white/10 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(s.status || 'new')}
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                        {store}
                      </span>
                    </div>
                    <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">
                      {s.message}
                    </p>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 shrink-0">
                    {formatWhen(s.createdAt)}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-white/5">
                  <div className="text-xs text-slate-500">
                    <span className="font-bold text-slate-300">{s.username}</span>
                    {s.userEmail ? ` · ${s.userEmail}` : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.status !== 'reviewed' && (
                      <button
                        type="button"
                        onClick={() => updateStatus(s.id, 'reviewed')}
                        className="btn-secondary px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <Eye size={12} />
                        Mark reviewed
                      </button>
                    )}
                    {s.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => updateStatus(s.id, 'resolved')}
                        className="btn-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={12} />
                        Resolved
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeSuggestion(s.id)}
                      className="btn-secondary px-3 py-1.5 text-[10px] text-rose-400 hover:text-rose-300"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default SuggestionsPanel;
