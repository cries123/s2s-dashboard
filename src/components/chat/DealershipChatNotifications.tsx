import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, PenSquare, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { DealershipChatMessage, User } from '../../types';
import {
  buildChatThreadSummaries,
  dismissDealershipChatMessage,
  markDealershipChatMessageRead,
  sendDealershipChatMessage,
  subscribeDealershipConversations,
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

type PanelView = 'thread' | 'new';

interface DealershipChatPanelProps {
  open: boolean;
  onClose: () => void;
  currentUser: User;
  dealershipId: string;
  tenantUsers: User[];
  initialRecipientUid?: string | null;
  initialRecipientName?: string | null;
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
  const [view, setView] = useState<PanelView>('thread');
  const [activeThreadUid, setActiveThreadUid] = useState('');
  const [newRecipientUid, setNewRecipientUid] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<DealershipChatMessage[]>([]);
  const [threadMessages, setThreadMessages] = useState<DealershipChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const recipients = useMemo(
    () =>
      tenantUsers
        .filter((u) => u.uid !== currentUser.uid)
        .filter(isDealershipChatEligible)
        .sort((a, b) => a.username.localeCompare(b.username)),
    [tenantUsers, currentUser.uid]
  );

  const threads = useMemo(
    () => buildChatThreadSummaries(conversationMessages, currentUser.uid),
    [conversationMessages, currentUser.uid]
  );

  const composeRecipientUid = view === 'new' ? newRecipientUid : activeThreadUid;
  const selectedRecipient = recipients.find((u) => u.uid === composeRecipientUid);
  const activeThreadName =
    selectedRecipient?.username ||
    threads.find((thread) => thread.otherUid === activeThreadUid)?.otherName ||
    initialRecipientName ||
    'Teammate';

  useEffect(() => {
    if (!open) return;
    if (initialRecipientUid) {
      setActiveThreadUid(initialRecipientUid);
      setView('thread');
      return;
    }
    if (threads.length > 0 && !activeThreadUid) {
      setActiveThreadUid(threads[0].otherUid);
      setView('thread');
    }
  }, [open, initialRecipientUid, threads, activeThreadUid]);

  useEffect(() => {
    if (!open) {
      setConversationMessages([]);
      return;
    }

    const unsub = subscribeDealershipConversations(
      dealershipId,
      currentUser.uid,
      setConversationMessages,
      (err) => console.error('[DealershipChat] conversations error', err)
    );

    return () => unsub();
  }, [open, dealershipId, currentUser.uid]);

  useEffect(() => {
    if (!open || view !== 'thread' || !activeThreadUid) {
      setThreadMessages([]);
      setThreadError(null);
      return;
    }

    const unsub = subscribeDealershipThread(
      dealershipId,
      currentUser.uid,
      activeThreadUid,
      (messages) => {
        setThreadMessages(messages);
        setThreadError(null);
      },
      (err) => {
        console.error('[DealershipChat] thread error', err);
        setThreadError(
          err instanceof Error ? err.message : 'Could not load this conversation.'
        );
      }
    );

    return () => unsub();
  }, [open, view, activeThreadUid, dealershipId, currentUser.uid]);

  useEffect(() => {
    if (!open || view !== 'thread' || !activeThreadUid) return;

    const unread = conversationMessages.filter(
      (message) =>
        message.fromUid === activeThreadUid &&
        message.toUid === currentUser.uid &&
        !message.readAt
    );

    unread.forEach((message) => {
      void markDealershipChatMessageRead(message.id).catch((err) =>
        console.error('[DealershipChat] mark read failed', err)
      );
    });
  }, [open, view, activeThreadUid, conversationMessages, currentUser.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages, view]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const recipientUid = composeRecipientUid;
    if (!recipientUid || !draft.trim()) return;

    const recipientName =
      selectedRecipient?.username ||
      threads.find((thread) => thread.otherUid === recipientUid)?.otherName ||
      initialRecipientName ||
      'Staff';

    setSending(true);
    setError(null);
    try {
      await sendDealershipChatMessage({
        dealershipId,
        tenantId: currentUser.tenantId,
        fromUid: currentUser.uid,
        fromName: currentUser.username || currentUser.email,
        toUid: recipientUid,
        toName: recipientName,
        body: draft,
      });
      setDraft('');
      if (view === 'new') {
        setActiveThreadUid(recipientUid);
        setNewRecipientUid('');
        setView('thread');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden flex flex-col max-h-[min(720px,calc(100vh-2rem))]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
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

        <div className="flex min-h-0 flex-1">
          <aside className="w-56 shrink-0 border-r border-slate-800 flex flex-col bg-slate-950/80">
            <div className="px-3 py-2 border-b border-slate-800">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                Open chats
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {threads.length === 0 ? (
                <p className="text-[10px] text-slate-600 px-2 py-4 leading-relaxed">
                  No conversations yet. Start a new message to reach dispatch or an advisor.
                </p>
              ) : (
                threads.map((thread) => {
                  const active = view === 'thread' && activeThreadUid === thread.otherUid;
                  const preview =
                    thread.lastMessage.fromUid === currentUser.uid
                      ? `You: ${thread.lastMessage.body}`
                      : thread.lastMessage.body;

                  return (
                    <button
                      key={thread.threadKey}
                      type="button"
                      onClick={() => {
                        setActiveThreadUid(thread.otherUid);
                        setView('thread');
                        setError(null);
                      }}
                      className={cn(
                        'w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'bg-indigo-500/15 border border-indigo-500/25'
                          : 'hover:bg-white/5 border border-transparent'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-white truncate">{thread.otherName}</p>
                        {thread.unreadCount > 0 ? (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-[9px] font-black text-white flex items-center justify-center">
                            {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-snug">
                        {preview}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setView('new');
                  setNewRecipientUid('');
                  setError(null);
                }}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors',
                  view === 'new'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                )}
              >
                <PenSquare size={12} />
                New message
              </button>
            </div>
          </aside>

          <div className="flex-1 min-w-0 flex flex-col">
            {view === 'new' ? (
              <div className="px-4 py-3 border-b border-slate-800">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  Send to
                </p>
                <select
                  value={newRecipientUid}
                  onChange={(e) => setNewRecipientUid(e.target.value)}
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
                  <p className="text-[10px] text-amber-400/90 leading-relaxed mt-2">
                    No teammates found yet. Approved staff at your dealership appear here once
                    Firestore rules are deployed.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="px-4 py-3 border-b border-slate-800">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                  Conversation
                </p>
                <p className="text-sm font-bold text-white mt-0.5">{activeThreadName}</p>
              </div>
            )}

            {view === 'thread' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[220px]">
                {threadError ? (
                  <p className="text-xs text-rose-400 text-center py-6">{threadError}</p>
                ) : threadMessages.length === 0 ? (
                  <p className="text-[10px] text-slate-600 text-center py-10 uppercase tracking-wider font-bold">
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
                        <p className="text-[9px] text-slate-500 mt-1">{formatMessageTime(msg.createdAt)}</p>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold text-center leading-relaxed">
                  Pick a teammate above, then type your message below
                </p>
              </div>
            )}

            <form onSubmit={handleSend} className="p-4 border-t border-slate-800 space-y-2 shrink-0">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  composeRecipientUid
                    ? 'Type a message for dispatch or your advisor…'
                    : view === 'new'
                      ? 'Select a teammate first'
                      : 'Open a chat or start a new message'
                }
                rows={3}
                disabled={!composeRecipientUid || sending}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 resize-none disabled:opacity-50"
              />
              {error ? <p className="text-xs text-rose-400">{error}</p> : null}
              <button
                type="submit"
                disabled={!composeRecipientUid || !draft.trim() || sending}
                className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[10px] font-black uppercase tracking-wider transition-colors"
              >
                {sending ? 'Sending…' : 'Send message'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
