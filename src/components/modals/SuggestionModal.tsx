import React, { useState } from 'react';
import { X, Lightbulb, Loader2, Send } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import type { User } from '../../types';
import { DEALERSHIPS } from '../../constants';

interface SuggestionModalProps {
  user: User;
  dealershipId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const SUGGESTIONS_PATH = 'artifacts/hyundai-sales-to-service/public/data/suggestions';

export function SuggestionModal({
  user,
  dealershipId,
  onClose,
  onSuccess,
  onError,
}: SuggestionModalProps) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dealershipName =
    DEALERSHIPS.find((d) => d.id === dealershipId)?.name || dealershipId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      onError('Please enter a suggestion before sending.');
      return;
    }
    if (trimmed.length > 2000) {
      onError('Suggestions must be 2000 characters or fewer.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, SUGGESTIONS_PATH), {
        message: trimmed,
        userId: user.uid,
        userEmail: user.email,
        username: user.username,
        dealershipId,
        dealershipName,
        status: 'new',
        createdAt: serverTimestamp(),
      });
      onSuccess('Thanks — your suggestion was sent to the admin team.');
      onClose();
    } catch (err) {
      console.error('Suggestion submit failed:', err);
      onError('Could not send your suggestion. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay sm:p-4 p-0 !items-start sm:!items-center overflow-y-auto scroll-smooth">
      <div
        className="w-full sm:max-w-lg card-base border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:rounded-3xl rounded-none min-h-[100dvh] sm:min-h-0"
        role="dialog"
        aria-labelledby="suggestion-modal-title"
      >
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-white/5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Lightbulb size={18} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2 id="suggestion-modal-title" className="text-lg font-black text-white">
                Send a suggestion
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Ideas for improvements, bugs, or workflow tweaks — sent straight to admin.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary p-2 shrink-0"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          <div className="rounded-xl border border-white/5 bg-slate-950/50 px-4 py-3 text-xs text-slate-400">
            <p>
              <span className="font-bold text-slate-300">{user.username}</span>
              {' · '}
              {dealershipName}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="suggestion-message" className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Your suggestion
            </label>
            <textarea
              id="suggestion-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={2000}
              autoFocus
              placeholder="Describe what you'd like improved or fixed..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-primary resize-y min-h-[140px]"
            />
            <p className="text-[10px] text-slate-600 text-right">{message.length}/2000</p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary px-4 py-2.5 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !message.trim()}
              className="btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Send suggestion
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SuggestionModal;
