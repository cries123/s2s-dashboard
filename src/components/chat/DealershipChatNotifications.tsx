import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { DealershipChatMessage, User } from '../../types';
import {
  dismissDealershipChatMessage,
  sendDealershipChatMessage,
  subscribeDealershipThread,
} from '../../lib/dealershipChat';
import { isDealershipChatEligible } from '../../lib/userDirectory';
import { cn } from '../../lib/utils';

interface DealershipChatNotificationsProps {
  inbox: DealershipChatMessage[];
  onOpenThread: (fromUid: string, fromName: string) => void;
}

export function DealershipChatNotifications({
  inbox,
  onOpenThread,
}: DealershipChatNotificationsProps) {
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  const activePopups = useMemo(
    () =>
      inbox
        .filter((msg) => !msg.dismissedAt && !dismissingIds.has(msg.id))
        .slice(-5),
    [inbox, dismissingIds]
  );

  const handleDismiss = async (message: DealershipChatMessage) => {
    setDismissingIds((prev) => new Set(prev).add(message.id));
    try {
      await dismissDealershipChatMessage(message.id);
    } catch (err) {
      console.error('[DealershipChat] dismiss failed', err);
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    }
  };

  const handleOpen = (message: DealershipChatMessage) => {
    onOpenThread(message.fromUid, message.fromName);
    void handleDismiss(message);
  };

  if (activePopups.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[10040] flex flex-col gap-3 max-w-sm w-[calc(100vw-2rem)] pointer-events-none">
      <AnimatePresence>
        {activePopups.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="pointer-events-auto rounded-2xl border border-indigo-500/30 bg-slate-950/95 shadow-2xl shadow-black/50 backdrop-blur-md overflow-hidden"
          >
            <div className="flex items-start gap-3 p-4">
              <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/20 shrink-0">
                <MessageSquare size={16} className="text-indigo-300" />
              </div>
              <button
                type="button"
                onClick={() => handleOpen(message)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                  Message from {message.fromName}
                </p>
                <p className="text-sm text-white mt-1 leading-snug break-words">{message.body}</p>
                <p className="text-[10px] text-slate-500 mt-2 font-medium">Click to reply</p>
              </button>
              <button
                type="button"
                onClick={() => void handleDismiss(message)}
                className={cn(
                  'p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors shrink-0'
                )}
                aria-label="Dismiss message"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface DealershipChatPanelProps {
  open: boolean;
  onClose: () => void;
  currentUser: User;
  dealershipId: string;
  tenantUsers: User[];
  initialRecipientUid?: string | null;
  initialRecipientName?: string | null;
}

export function DealershipChatPanel({
  open,
  onClose,
  currentUser,
  dealershipId,
  tenantUsers,
  initialRecipientUid,
  initialRecipientName,
}: DealershipChatPanelProps) {
  const [recipientUid, setRecipientUid] = useState(initialRecipientUid || '');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [threadMessages, setThreadMessages] = useState<DealershipChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRecipientUid) setRecipientUid(initialRecipientUid);
  }, [initialRecipientUid, open]);

  useEffect(() => {
    if (!open || !recipientUid) {
      setThreadMessages([]);
      return;
    }

    const unsub = subscribeDealershipThread(
      dealershipId,
      currentUser.uid,
      recipientUid,
      setThreadMessages,
      (err) => console.error('[DealershipChat] thread error', err)
    );

    return () => unsub();
  }, [open, recipientUid, dealershipId, currentUser.uid]);

  const recipients = useMemo(
    () =>
      tenantUsers
        .filter((u) => u.uid !== currentUser.uid)
        .filter(isDealershipChatEligible)
        .sort((a, b) => a.username.localeCompare(b.username)),
    [tenantUsers, currentUser.uid]
  );

  const selectedRecipient = recipients.find((u) => u.uid === recipientUid);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recipientUid || !draft.trim()) return;

    setSending(true);
    setError(null);
    try {
      await sendDealershipChatMessage({
        dealershipId,
        tenantId: currentUser.tenantId,
        fromUid: currentUser.uid,
        fromName: currentUser.username || currentUser.email,
        toUid: recipientUid,
        toName: selectedRecipient?.username || initialRecipientName || 'Staff',
        body: draft,
      });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">Team chat</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Messages stay within your dealership</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5"
            aria-label="Close chat"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
              Send to
            </label>
            <select
              value={recipientUid}
              onChange={(e) => setRecipientUid(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white"
            >
              <option value="">Select a teammate…</option>
              {recipients.map((user) => (
                <option key={user.uid} value={user.uid}>
                  {user.username}
                  {user.jobTitle ? ` · ${user.jobTitle}` : ''}
                </option>
              ))}
            </select>
            {recipients.length === 0 ? (
              <p className="text-[10px] text-amber-400/90 leading-relaxed">
                No teammates found yet. Approved staff at your dealership appear here once Firestore
                rules are deployed — ask an admin to publish the latest rules if this stays empty.
              </p>
            ) : null}
          </div>

          {recipientUid ? (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2">
              {threadMessages.length === 0 ? (
                <p className="text-[10px] text-slate-600 text-center py-6 uppercase tracking-wider font-bold">
                  No messages yet
                </p>
              ) : (
                threadMessages.map((msg) => {
                  const mine = msg.fromUid === currentUser.uid;
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                        mine
                          ? 'ml-auto bg-indigo-500/20 text-indigo-50 border border-indigo-500/20'
                          : 'mr-auto bg-slate-800 text-slate-100 border border-slate-700/60'
                      )}
                    >
                      {!mine ? (
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                          {msg.fromName}
                        </p>
                      ) : null}
                      <p className="leading-snug break-words">{msg.body}</p>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          <form onSubmit={handleSend} className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                recipientUid ? 'Type a message for dispatch or your advisor…' : 'Pick a teammate first'
              }
              rows={3}
              disabled={!recipientUid || sending}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 resize-none disabled:opacity-50"
            />
            {error ? <p className="text-xs text-rose-400">{error}</p> : null}
            <button
              type="submit"
              disabled={!recipientUid || !draft.trim() || sending}
              className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[10px] font-black uppercase tracking-wider transition-colors"
            >
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
