/**
 * The AI routes, against stand-ins for Firestore and OpenAI.
 *
 * What matters is not the wording but the guarantees: explanations and
 * summaries are never saved; an answer with an invented number is retried and
 * then refused; the briefing falls back to the app's own words; a customer from
 * another store cannot be read.
 *
 * Run: npm run test:airoutes
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const FAKES = {
  'initFirebaseAdmin': `export const getAdminFirestore = () => globalThis.__F.db;`,
  'pbsFirestore': `export const customersCollection = (db) => db.customers;`,
  'briefingFacts': `export const loadBriefingFacts = async () => globalThis.__F.briefing;`,
};

const outDir = mkdtempSync(join(tmpdir(), 's2s-airoutes-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['server/handlers/aiAssistRoutes.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outfile: entry,
  logLevel: 'error',
  plugins: [{
    name: 'fakes',
    setup(build) {
      build.onResolve({ filter: /(initFirebaseAdmin|pbsFirestore|briefingFacts)\.js$/ }, (a) => ({ path: a.path, namespace: 'fake' }));
      build.onLoad({ filter: /.*/, namespace: 'fake' }, (a) => ({ contents: FAKES[Object.keys(FAKES).find((k) => a.path.includes(k))], loader: 'js' }));
    },
  }],
});

process.env.OPENAI_API_KEY = 'sk-test-not-real';
const F = (globalThis.__F = {});
const { registerAiAssistRoutes } = await import(pathToFileURL(entry).href);
console.warn = () => {};
console.error = () => {};

// --- stand-ins ---------------------------------------------------------------------------
function makeDb(customers) {
  const store = {};
  const writes = [];
  const customerDoc = (id) => {
    const c = customers[id];
    const visits = c?.visits ?? [];
    const ref = {
      collection: () => ({
        get: async () => ({ docs: visits.map((v) => ({ id: v.id, data: () => v })) }),
        doc: (vid) => ({ get: async () => { const v = visits.find((x) => x.id === vid); return { exists: Boolean(v), data: () => v }; } }),
      }),
    };
    return { get: async () => ({ exists: Boolean(c), data: () => c?.data, ref }) };
  };
  return {
    writes,
    store,
    customers: { doc: customerDoc },
    doc: (path) => ({
      get: async () => ({ data: () => store[path] }),
      set: async (v) => { writes.push(path); store[path] = v; },
    }),
  };
}

function makeOpenAI(replies) {
  const sent = [];
  return {
    sent,
    client: {
      chat: { completions: { create: async (req) => { sent.push(req); const r = replies.shift(); if (r instanceof Error) throw r; return { choices: [{ message: { content: r } }] }; } } },
    },
  };
}

const routes = {};
const app = { get: (p, h) => (routes[`GET ${p}`] = h), post: (p, h) => (routes[`POST ${p}`] = h) };
let openai;
registerAiAssistRoutes(app, { getOpenAIClient: () => openai.client });

async function call(route, body, user = { uid: 'u1', dealershipId: 'hyundai', isAdmin: false }) {
  const out = { status: 200, body: null };
  const res = { status(s) { out.status = s; return res; }, json(b) { out.body = b; return res; } };
  await routes[route]({ body, approvedUser: user }, res);
  return out;
}

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); failed++; } else passed++;
}

const brakeVisit = {
  id: 'pbs-111682', soNumber: '111682', date: '2026-04-07', mileage: 32104,
  lines: [{ lineNumber: 1, concern: 'SQUEAL WHEN BRAKING', cause: 'FRONT PADS AT 2MM', correction: 'REPLACED FRONT PADS AND ROTORS' }],
};
const customers = {
  c1: { data: { dealershipId: 'hyundai', firstName: 'KEVIN', lastName: 'BURNS', phone: '8055551234', year: '2020', make: 'Hyundai', model: 'Elantra' }, visits: [brakeVisit] },
  ford1: { data: { dealershipId: 'ford' }, visits: [brakeVisit] },
};

// --- explain a visit -------------------------------------------------------------------------
F.db = makeDb(customers);
openai = makeOpenAI(['Your front brake pads were worn down to 2 millimeters, so we replaced them along with the rotors.']);
let r = await call('POST /api/ai/explain-visit', { customerId: 'c1', visitId: 'pbs-111682' });
check('explains a repair order', [r.status, r.body.text.startsWith('Your front brake pads')], [200, true]);
check('nothing was saved', F.db.writes, []);
check("the customer's name and phone never reach the AI", JSON.stringify(openai.sent).includes('BURNS') || JSON.stringify(openai.sent).includes('8055551234'), false);
check('the technician notes do', JSON.stringify(openai.sent).includes('FRONT PADS AT 2MM'), true);

openai = makeOpenAI(['Bring it back in 5,000 miles for a check.', 'We replaced your front brake pads and rotors.']);
r = await call('POST /api/ai/explain-visit', { customerId: 'c1', visitId: 'pbs-111682' });
check('an invented mileage is retried', [r.status, openai.sent.length, r.body.text], [200, 2, 'We replaced your front brake pads and rotors.']);

openai = makeOpenAI(['Come back in 5,000 miles.', 'Come back in 3,000 miles.']);
r = await call('POST /api/ai/explain-visit', { customerId: 'c1', visitId: 'pbs-111682' });
check('and refused if it does it again', [r.status, Boolean(r.body.text)], [422, false]);

openai = makeOpenAI(['x']);
r = await call('POST /api/ai/explain-visit', { customerId: 'ford1', visitId: 'pbs-111682' });
check("another store's customer can't be read", [r.status, openai.sent.length], [404, 0]);
r = await call('POST /api/ai/explain-visit', { customerId: 'ford1', visitId: 'pbs-111682' }, { uid: 'a', dealershipId: 'hyundai', isAdmin: true });
check('an admin can', r.status, 200);

openai = makeOpenAI(['We replaced your front brake pads and rotors.']);
r = await call('POST /api/ai/explain-visit', { customerId: 'c1', soNumber: '111682' });
check('found by repair order number too', r.status, 200);

// --- summarize history -------------------------------------------------------------------
F.db = makeDb(customers);
openai = makeOpenAI(['This Elantra came in on 2026-04-07 at 32,104 miles for a brake squeal; the front pads and rotors were replaced.']);
r = await call('POST /api/ai/history-summary', { customerId: 'c1' });
check('summarizes history', [r.status, r.body.visits], [200, 1]);
check('nothing was saved', F.db.writes, []);

// --- the briefing ----------------------------------------------------------------------------
F.briefing = {
  today: '2026-10-17',
  noShowNames: ['SMITH, ANN'],
  facts: { todayLabel: 'Friday, October 17', month: 'October', laborGross: '$27,167', laborGoal: '$85,000', laborTrending: '$54,334', laborPctOfGoal: '64%', lastDayLabel: 'Yesterday', lastDayShowed: '19', lastDayBooked: '21', lastDayNoShows: '2' },
};
F.db = makeDb(customers);
openai = makeOpenAI(['Labor gross is $27,167, trending to $54,334, which is 64% of the $85,000 goal. Yesterday 19 of 21 customers showed up.']);
r = await call('GET /api/ai/briefing');
check('writes the briefing with AI', [r.status, r.body.source], [200, 'ai']);
check('no-show names are listed by the app', r.body.noShowNames, ['SMITH, ANN']);
check('but never sent to the AI', JSON.stringify(openai.sent).includes('SMITH'), false);
check('one briefing kept for the day', F.db.writes, ['artifacts/hyundai-sales-to-service/public/data/aiBriefings/hyundai_2026-10-17']);

openai = makeOpenAI(['should not be asked']);
r = await call('GET /api/ai/briefing');
check('the same numbers later: the kept one, no new AI call', [r.body.source, openai.sent.length], ['ai', 0]);

F.briefing = { ...F.briefing, facts: { ...F.briefing.facts, laborGross: '$29,400' } };
openai = makeOpenAI(['Labor gross is about $30,000.', 'Labor gross hit $31,000.']);
r = await call('GET /api/ai/briefing');
check('new numbers + an AI that keeps rounding: the app writes it itself', [r.body.source, r.body.text.startsWith('Labor gross is $29,400 so far in October')], ['template', true]);
const briefPath = 'artifacts/hyundai-sales-to-service/public/data/aiBriefings/hyundai_2026-10-17';
check('and the record says why', F.db.store[briefPath].aiFailure, 'kept adding numbers not in the facts: 31000');

openai = makeOpenAI(['should not be asked']);
r = await call('GET /api/ai/briefing');
check('a fallback minutes old is kept as is', [r.body.source, openai.sent.length], ['template', 0]);

F.db.store[briefPath].generatedAt = new Date(Date.now() - 31 * 60_000).toISOString();
openai = makeOpenAI(['Labor gross is $29,400, trending to $54,334.']);
r = await call('GET /api/ai/briefing');
check('after 30 minutes the AI gets another go', [r.body.source, openai.sent.length], ['ai', 1]);
check('and the failure note clears', F.db.store[briefPath].aiFailure, null);

F.db = makeDb(customers);
openai = makeOpenAI([new Error('OpenAI is down')]);
r = await call('GET /api/ai/briefing');
check('OpenAI down: the briefing still shows', [r.status, r.body.source], [200, 'template']);
check('and the record says OpenAI failed', String(F.db.store[briefPath].aiFailure).startsWith('OpenAI error'), true);

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
