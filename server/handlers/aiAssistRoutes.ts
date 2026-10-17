import type { Express, Request, Response } from 'express';
import type OpenAI from 'openai';
import { getAdminFirestore } from '../admin/initFirebaseAdmin.js';
import type { ApprovedUser } from '../admin/requireApprovedUser.js';
import { hasUsableOpenAIKey, openAiFailureMessage, openAiFailureStatus, OPENAI_REQUIRED_MESSAGE } from '../dms/requireOpenAi.js';
import { customersCollection } from '../pbs/pbsFirestore.js';
import {
  briefingFactsText,
  historyText,
  templateBriefing,
  unsupportedNumbers,
  visitStoryText,
  type VisitLike,
} from '../ai/aiText.js';
import { loadBriefingFacts } from '../ai/briefingFacts.js';

/**
 * AI that rewords, never decides.
 *
 *   GET  /api/ai/briefing         the morning briefing — one per store per day,
 *                                 cached until its numbers change
 *   POST /api/ai/history-summary  a car's visits in a few sentences — on request,
 *                                 never stored
 *   POST /api/ai/explain-visit    a repair order in plain words for the
 *                                 customer — on request, never stored; the
 *                                 repair order itself is untouched
 *
 * All three are behind the approved-user gate in server.ts (the /api/ai/
 * prefix). Each reads its source from Firestore itself rather than taking text
 * from the browser, so it works only on this store's real records, and any
 * number in the answer must already be in that source (aiText.unsupportedNumbers).
 */

type GetOpenAI = () => OpenAI;
const MODEL = () => process.env.OPENAI_ASSIST_MODEL?.trim() || 'gpt-4o-mini';
const DATA_ROOT = 'artifacts/hyundai-sales-to-service/public/data';

function approvedUser(req: Request): ApprovedUser | undefined {
  return (req as Request & { approvedUser?: ApprovedUser }).approvedUser;
}

/**
 * Ask once; if the answer carries a number that is not in the source, ask again
 * with that pointed out. `text` is null when it still strays, and `invented`
 * says what it kept adding.
 */
async function faithfulCompletionDetailed(
  openai: OpenAI,
  system: string,
  user: string,
  sources: string[],
  maxTokens: number
): Promise<{ text: string | null; invented: string[] }> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  let invented: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openai.chat.completions.create({
      model: MODEL(),
      temperature: attempt === 0 ? 0.3 : 0,
      max_tokens: maxTokens,
      messages,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!text) continue;
    invented = unsupportedNumbers(text, sources);
    if (invented.length === 0) return { text, invented };
    console.warn(`[ai] Answer used numbers not in its source (${invented.join(', ')}); ${attempt === 0 ? 'retrying' : 'giving up'}.`);
    messages.push(
      { role: 'assistant', content: text },
      {
        role: 'user',
        content: `These numbers are not in what you were given: ${invented.join(', ')}. Rewrite without them. Use only numbers that appear in the text above.`,
      }
    );
  }
  return { text: null, invented };
}

async function faithfulCompletion(
  openai: OpenAI,
  system: string,
  user: string,
  sources: string[],
  maxTokens: number
): Promise<string | null> {
  return (await faithfulCompletionDetailed(openai, system, user, sources, maxTokens)).text;
}

/** How long a fallback briefing stands before the AI is asked again for the same numbers. */
const RETRY_AI_AFTER_MS = 30 * 60_000;

// --- the briefing -------------------------------------------------------------------------

const BRIEFING_SYSTEM = `You write the morning briefing for a car dealership's service department, read by the manager and advisors on their phones.

Rules:
- Use ONLY the facts given. Copy every number exactly as written — never calculate, round, total, compare or add a number.
- 3 or 4 short sentences in plain words. Lead with what matters most today.
- No greeting, no sign-off, no advice, no praise, no emojis, no markdown, no lists.
- Leave out anything that is not in the facts.`;

async function briefingRoute(req: Request, res: Response, getOpenAI: GetOpenAI) {
  const user = approvedUser(req);
  const db = getAdminFirestore();
  if (!user || !db) return res.status(503).json({ error: 'The server cannot read the dealership data right now.' });

  try {
    const { facts, noShowNames, today } = await loadBriefingFacts(db, user.dealershipId);
    const factsText = briefingFactsText(facts);
    const cacheRef = db.doc(`${DATA_ROOT}/aiBriefings/${user.dealershipId}_${today}`);
    const cached = (await cacheRef.get()).data();
    const base = { facts, noShowNames, date: today };

    // Same numbers as the last one written today: send that one back — unless it
    // is the app's fallback and has stood long enough to give the AI another go.
    const fallbackAge = cached?.generatedAt ? Date.now() - new Date(String(cached.generatedAt)).getTime() : Infinity;
    const retryAi = cached?.source === 'template' && hasUsableOpenAIKey() && fallbackAge > RETRY_AI_AFTER_MS;
    if (cached?.factsText === factsText && typeof cached.text === 'string' && !retryAi) {
      return res.json({ ...base, text: cached.text, source: cached.source, generatedAt: cached.generatedAt });
    }

    let text = templateBriefing(facts);
    let source: 'ai' | 'template' = 'template';
    // Why the AI's version wasn't used, kept on the record so it can be read
    // without server logs. Null when the AI's version is the one shown.
    let aiFailure: string | null = hasUsableOpenAIKey() ? null : 'no OpenAI key on the server';
    if (hasUsableOpenAIKey() && (facts.laborGross || facts.appointmentsMtd || facts.lastDayBooked)) {
      try {
        const written = await faithfulCompletionDetailed(getOpenAI(), BRIEFING_SYSTEM, `Facts:\n${factsText}`, [factsText], 220);
        if (written.text) {
          text = written.text;
          source = 'ai';
        } else {
          aiFailure = written.invented.length
            ? `kept adding numbers not in the facts: ${written.invented.join(', ')}`
            : 'empty answer';
        }
      } catch (err) {
        // The briefing still shows, in the app's own words.
        console.error('[ai/briefing] OpenAI failed; using the template:', err);
        aiFailure = `OpenAI error: ${openAiFailureMessage(err)}`.slice(0, 300);
      }
    }

    const generatedAt = new Date().toISOString();
    await cacheRef.set({ factsText, text, source, generatedAt, model: source === 'ai' ? MODEL() : null, aiFailure });
    return res.json({ ...base, text, source, generatedAt });
  } catch (err) {
    console.error('[ai/briefing]', err);
    return res.status(500).json({ error: 'Could not put the briefing together.' });
  }
}

// --- one customer's visits -----------------------------------------------------------------

async function loadCustomerForUser(customerId: unknown, user: ApprovedUser) {
  const db = getAdminFirestore();
  if (!db || typeof customerId !== 'string' || !customerId.trim()) return null;
  const snap = await customersCollection(db).doc(customerId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const store = String(data.dealershipId || 'hyundai');
  if (!user.isAdmin && store !== user.dealershipId) return null;
  return { db, ref: snap.ref, data };
}

/** A customer's visits: their own collection, plus any still in the old array. */
async function loadVisits(customer: NonNullable<Awaited<ReturnType<typeof loadCustomerForUser>>>): Promise<Array<VisitLike & { id?: string; soNumber?: string }>> {
  const sub = await customer.ref.collection('serviceVisits').get();
  const visits = sub.docs.map((d) => ({ id: d.id, ...(d.data() as VisitLike & { soNumber?: string }) }));
  const seen = new Set(visits.map((v) => String(v.soNumber || v.id)));
  for (const v of Array.isArray(customer.data.recentVisits) ? customer.data.recentVisits : []) {
    const key = String(v?.soNumber || v?.id || '');
    if (key && !seen.has(key)) visits.push(v);
  }
  return visits;
}

const HISTORY_SYSTEM = `You summarize a car's service history for a dealership service advisor who is about to talk to the owner.

Rules:
- Use ONLY the visits listed. Copy any number exactly as written; never calculate, estimate or add one.
- 2 or 3 short sentences: how long and how often it has been coming in, what work keeps coming up, and the most recent visit.
- Plain words. Do not recommend work, guess at problems, or mention prices. No markdown, no lists.`;

async function historySummaryRoute(req: Request, res: Response, getOpenAI: GetOpenAI) {
  const user = approvedUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in again.' });
  if (!hasUsableOpenAIKey()) return res.status(422).json({ error: OPENAI_REQUIRED_MESSAGE });

  try {
    const customer = await loadCustomerForUser(req.body?.customerId, user);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    const visits = await loadVisits(customer);
    const text = historyText(visits);
    if (!text) return res.json({ text: 'No dated visits to summarize yet.', visits: 0 });

    const vehicle = [customer.data.year, customer.data.make, customer.data.model].filter(Boolean).join(' ');
    const prompt = `${vehicle ? `Vehicle: ${vehicle}\n` : ''}Visits (newest first; date · mileage · work):\n${text}`;
    const summary = await faithfulCompletion(getOpenAI(), HISTORY_SYSTEM, prompt, [prompt], 200);
    if (!summary) return res.status(422).json({ error: "The summary kept adding numbers that aren't in the history, so it wasn't shown. Try again." });
    return res.json({ text: summary, visits: visits.length });
  } catch (err) {
    console.error('[ai/history-summary]', err);
    return res.status(openAiFailureStatus(err)).json({ error: openAiFailureMessage(err) });
  }
}

const EXPLAIN_SYSTEM = `You help a car dealership service advisor explain a repair to the car's owner, who is not a mechanic.

Rewrite the repair order below the way the advisor would say it to the customer: plain everyday words, short sentences, "your car".

Rules — these matter more than sounding good:
- Say only what the repair order says. Do not add causes, diagnoses, recommendations, safety warnings, urgency, parts, prices, mileages or time frames that are not written there.
- Do not guess what shorthand means if you are not sure; leave that detail out rather than invent it.
- Keep any number exactly as written. Do not mention prices.
- One short paragraph per job, in the same order. No headings, no lists, no markdown, no greeting.`;

async function explainVisitRoute(req: Request, res: Response, getOpenAI: GetOpenAI) {
  const user = approvedUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in again.' });
  if (!hasUsableOpenAIKey()) return res.status(422).json({ error: OPENAI_REQUIRED_MESSAGE });

  try {
    const customer = await loadCustomerForUser(req.body?.customerId, user);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    const visitId = String(req.body?.visitId || '');
    const soNumber = String(req.body?.soNumber || '');

    let visit: VisitLike | undefined;
    if (visitId) {
      const doc = await customer.ref.collection('serviceVisits').doc(visitId).get();
      if (doc.exists) visit = doc.data() as VisitLike;
    }
    if (!visit) {
      visit = (await loadVisits(customer)).find((v) => (visitId && v.id === visitId) || (soNumber && String(v.soNumber) === soNumber));
    }
    if (!visit) return res.status(404).json({ error: 'Repair order not found.' });

    const story = visitStoryText(visit);
    if (!story) return res.json({ text: 'This repair order has no notes to explain.' });

    const vehicle = [customer.data.year, customer.data.make, customer.data.model].filter(Boolean).join(' ');
    const prompt = `${vehicle ? `Vehicle: ${vehicle}\n` : ''}Repair order:\n${story}`;
    const text = await faithfulCompletion(getOpenAI(), EXPLAIN_SYSTEM, prompt, [prompt], 500);
    if (!text) return res.status(422).json({ error: "The explanation kept adding numbers that aren't on the repair order, so it wasn't shown. Try again." });
    return res.json({ text });
  } catch (err) {
    console.error('[ai/explain-visit]', err);
    return res.status(openAiFailureStatus(err)).json({ error: openAiFailureMessage(err) });
  }
}

export function registerAiAssistRoutes(app: Express, deps: { getOpenAIClient: GetOpenAI }) {
  app.get('/api/ai/briefing', (req, res) => briefingRoute(req, res, deps.getOpenAIClient));
  app.post('/api/ai/history-summary', (req, res) => historySummaryRoute(req, res, deps.getOpenAIClient));
  app.post('/api/ai/explain-visit', (req, res) => explainVisitRoute(req, res, deps.getOpenAIClient));
}
