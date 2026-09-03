/**
 * Read-only audit of service-visit record quality.
 *
 * WHY THIS EXISTS
 * ----------------
 * Before the PBS PartnerHUB integration, service history was loaded from a CSV
 * export. Those rows only ever carried a summary line — no job lines, no parts,
 * no labour hours, often no advisor or mileage. Records synced through the API
 * since then carry the full structure (`lines[]` with concern/cause/correction,
 * `labourLines[]`, `partLines[]`, `payTypeTotals`).
 *
 * The result is a customer timeline where recent visits look complete and older
 * ones look empty. This script measures exactly how much of that there is, so the
 * repair can be scoped before anything is written.
 *
 * It is READ-ONLY. It writes nothing.
 *
 * USAGE
 *   npx tsx scripts/audit-legacy-visits.ts
 *   npx tsx scripts/audit-legacy-visits.ts --dealership hyundai
 *   npx tsx scripts/audit-legacy-visits.ts --csv > legacy-visits.csv
 *
 * Requires the same Firebase Admin credentials server.ts uses
 * (FIREBASE_SERVICE_ACCOUNT_JSON).
 */
import { getFirebaseAdminApp } from '../server/admin/initFirebaseAdmin.js';
import { getFirestore } from 'firebase-admin/firestore';

const DATA_ROOT = 'artifacts/hyundai-sales-to-service/public/data';

interface VisitRow {
  customerId: string;
  customerName: string;
  dealershipId: string;
  soNumber: string;
  date: string;
  year: string;
  hasLines: boolean;
  hasParts: boolean;
  hasLabour: boolean;
  hasPayTotals: boolean;
  hasMileage: boolean;
  hasAdvisor: boolean;
  requests: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  getFirebaseAdminApp();
  const db = getFirestore();

  const dealershipFilter = arg('dealership');
  const asCsv = process.argv.includes('--csv');

  let ref = db.collection(`${DATA_ROOT}/customers`) as FirebaseFirestore.Query;
  if (dealershipFilter) ref = ref.where('dealershipId', '==', dealershipFilter);

  const snap = await ref.get();
  const rows: VisitRow[] = [];

  for (const doc of snap.docs) {
    const c = doc.data() as Record<string, any>;
    const visits: any[] = Array.isArray(c.recentVisits) ? c.recentVisits : [];
    for (const v of visits) {
      const lines: any[] = Array.isArray(v.lines) ? v.lines : [];
      rows.push({
        customerId: doc.id,
        customerName: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
        dealershipId: c.dealershipId || '(none)',
        soNumber: String(v.soNumber || ''),
        date: String(v.date || ''),
        year: String(v.date || '').slice(0, 4) || '(no date)',
        hasLines: lines.length > 0,
        hasParts: lines.some((l) => Array.isArray(l.partLines) && l.partLines.length > 0),
        hasLabour: lines.some((l) => Array.isArray(l.labourLines) && l.labourLines.length > 0),
        hasPayTotals: !!v.payTypeTotals,
        hasMileage: Number(v.mileage) > 0,
        hasAdvisor: !!String(v.advisor || '').trim(),
        requests: String(v.requests || '').slice(0, 60),
      });
    }
  }

  if (asCsv) {
    console.log(
      'customerId,customerName,dealershipId,soNumber,date,hasLines,hasParts,hasLabour,hasPayTotals,hasMileage,hasAdvisor,requests'
    );
    for (const r of rows) {
      const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
      console.log(
        [
          r.customerId, esc(r.customerName), r.dealershipId, esc(r.soNumber), r.date,
          r.hasLines, r.hasParts, r.hasLabour, r.hasPayTotals, r.hasMileage, r.hasAdvisor,
          esc(r.requests),
        ].join(',')
      );
    }
    return;
  }

  const total = rows.length;
  const thin = rows.filter((r) => !r.hasLines);
  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : '0%');

  console.log(`\nCustomers scanned:      ${snap.size}`);
  console.log(`Service visits found:   ${total}`);
  console.log(`\n--- Record completeness ---`);
  console.log(`  No job lines at all:  ${thin.length.toString().padStart(6)}  ${pct(thin.length)}   <- the CSV-era rows`);
  console.log(`  No parts detail:      ${rows.filter((r) => !r.hasParts).length.toString().padStart(6)}  ${pct(rows.filter((r) => !r.hasParts).length)}`);
  console.log(`  No labour detail:     ${rows.filter((r) => !r.hasLabour).length.toString().padStart(6)}  ${pct(rows.filter((r) => !r.hasLabour).length)}`);
  console.log(`  No pay-type totals:   ${rows.filter((r) => !r.hasPayTotals).length.toString().padStart(6)}  ${pct(rows.filter((r) => !r.hasPayTotals).length)}`);
  console.log(`  No mileage:           ${rows.filter((r) => !r.hasMileage).length.toString().padStart(6)}  ${pct(rows.filter((r) => !r.hasMileage).length)}`);
  console.log(`  No advisor:           ${rows.filter((r) => !r.hasAdvisor).length.toString().padStart(6)}  ${pct(rows.filter((r) => !r.hasAdvisor).length)}`);

  const byYear = new Map<string, { total: number; thin: number }>();
  for (const r of rows) {
    const e = byYear.get(r.year) || { total: 0, thin: 0 };
    e.total++;
    if (!r.hasLines) e.thin++;
    byYear.set(r.year, e);
  }
  console.log(`\n--- By year (thin = no job lines) ---`);
  for (const [year, e] of [...byYear.entries()].sort()) {
    const bar = '#'.repeat(Math.round((e.thin / Math.max(e.total, 1)) * 30));
    console.log(`  ${year}  ${String(e.total).padStart(6)} visits  ${String(e.thin).padStart(6)} thin  ${bar}`);
  }

  const withSo = thin.filter((r) => r.soNumber.trim()).length;
  console.log(`\n--- Repair feasibility ---`);
  console.log(`  Thin visits WITH an SO/RO number:    ${withSo}  <- re-fetchable from PBS RepairOrderGet`);
  console.log(`  Thin visits WITHOUT an SO/RO number: ${thin.length - withSo}  <- cannot be matched back; best left as-is`);

  const commonest = new Map<string, number>();
  for (const r of thin) commonest.set(r.requests, (commonest.get(r.requests) || 0) + 1);
  console.log(`\n--- Most common placeholder descriptions ---`);
  for (const [text, n] of [...commonest.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(n).padStart(6)}  ${text || '(empty)'}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
