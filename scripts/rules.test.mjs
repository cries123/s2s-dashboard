/**
 * Firestore security-rules tests.
 *
 * These assert the property the business actually depends on: a user of one store can
 * never read another store's data, and nobody can promote themselves.
 *
 * Run: npm run test:rules
 */
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';

const ROOT = 'artifacts/hyundai-sales-to-service/public/data';
const userPath = (uid) => `${ROOT}/users/${uid}`;

let passed = 0;
let failed = 0;

async function check(name, promise) {
  try {
    await promise;
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message.split('\n')[0]}`);
    failed++;
  }
}

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-s2s',
  firestore: {
    rules: readFileSync('firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

// ---- Seed data bypassing rules -------------------------------------------------
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, userPath('hyundai-advisor')), {
    email: 'advisor@hyundai.test', role: 'advisor', approved: true, status: 'approved',
    department: 'service', tenantId: 'hyundai', dealershipId: 'hyundai',
  });
  await setDoc(doc(db, userPath('nissan-manager')), {
    email: 'mgr@nissan.test', role: 'manager', isManager: true, approved: true, status: 'approved',
    department: 'service', tenantId: 'nissan-mazda', dealershipId: 'nissan',
  });
  await setDoc(doc(db, userPath('pending-user')), {
    email: 'pending@x.test', role: 'pending', approved: false, status: 'pending',
    department: 'service', tenantId: 'hyundai', dealershipId: 'hyundai',
  });

  await setDoc(doc(db, `${ROOT}/customers/cust-hyundai`), {
    name: 'Hyundai Customer', phone: '805-555-0100', dealershipId: 'hyundai',
  });
  await setDoc(doc(db, `${ROOT}/dealershipSettings/hyundai`), {
    enrollmentJoinCode: 'SECRET1', monthlyTarget: 250000,
  });
  await setDoc(doc(db, 'artifacts/hyundai-sales-to-service/public/audit/systemLogs/log1'), {
    dealershipId: 'hyundai', userEmail: 'advisor@hyundai.test', action: 'enrolled customer',
  });
});

const advisor = testEnv.authenticatedContext('hyundai-advisor', { email: 'advisor@hyundai.test' }).firestore();
const nissanMgr = testEnv.authenticatedContext('nissan-manager', { email: 'mgr@nissan.test' }).firestore();
const pending = testEnv.authenticatedContext('pending-user', { email: 'pending@x.test' }).firestore();
const stranger = testEnv.authenticatedContext('stranger', { email: 'stranger@evil.test' }).firestore();

console.log('\nStore separation');
await check('Nissan manager CANNOT read a Hyundai customer',
  assertFails(getDoc(doc(nissanMgr, `${ROOT}/customers/cust-hyundai`))));
await check('Nissan manager CANNOT list Hyundai customers',
  assertFails(getDocs(query(collection(nissanMgr, `${ROOT}/customers`), where('dealershipId', '==', 'hyundai')))));
await check('Nissan manager CANNOT read Hyundai dealershipSettings (join code)',
  assertFails(getDoc(doc(nissanMgr, `${ROOT}/dealershipSettings/hyundai`))));
await check('Nissan manager CANNOT read a Hyundai system log',
  assertFails(getDoc(doc(nissanMgr, 'artifacts/hyundai-sales-to-service/public/audit/systemLogs/log1'))));

console.log('\nUnapproved accounts');
await check('Pending user CANNOT read a customer in their own store',
  assertFails(getDoc(doc(pending, `${ROOT}/customers/cust-hyundai`))));
await check('Pending user CANNOT read dealershipSettings',
  assertFails(getDoc(doc(pending, `${ROOT}/dealershipSettings/hyundai`))));

console.log('\nSelf-promotion');
await check('Stranger CANNOT self-create an approved manager doc',
  assertFails(setDoc(doc(stranger, userPath('stranger')), {
    email: 'stranger@evil.test', role: 'manager', isManager: true,
    approved: false, status: 'approved', department: 'service',
    tenantId: 'nissan-mazda', dealershipId: 'nissan',
  })));
await check('Stranger CANNOT self-create naming a mismatched dealershipId',
  assertFails(setDoc(doc(stranger, userPath('stranger')), {
    email: 'stranger@evil.test', role: 'pending', approved: false, status: 'pending',
    department: 'service', tenantId: 'nissan-mazda', dealershipId: 'hyundai',
  })));
await check('Stranger CAN self-create a legitimate pending signup',
  assertSucceeds(setDoc(doc(stranger, userPath('stranger')), {
    email: 'stranger@evil.test', role: 'pending', approved: false, status: 'pending',
    department: 'service', tenantId: 'nissan-mazda', dealershipId: 'nissan',
  })));

// These mirror the exact payloads src/components/auth/LoginView.tsx writes, so the
// rules can never drift from the real signup flow without a test failing.
console.log('\nReal signup payloads from LoginView');
const advisorCtx = testEnv.authenticatedContext('new-advisor', { email: 'adv@new.test' }).firestore();
await check('Advisor enrolment (LoginView payload) is accepted',
  assertSucceeds(setDoc(doc(advisorCtx, userPath('new-advisor')), {
    uid: 'new-advisor', email: 'stranger@evil.test', username: 'New Advisor',
    tenantId: 'nissan-mazda', dealershipId: 'nissan', department: 'service',
    role: 'pending', approved: false, status: 'pending', isManager: false,
    jobTitle: 'Service Advisor', createdAt: new Date(),
  })));
const mgrCtx = testEnv.authenticatedContext('new-manager', { email: 'mgr@new.test' }).firestore();
await check('Manager enrolment (LoginView payload) is accepted and stays unapproved',
  assertSucceeds(setDoc(doc(mgrCtx, userPath('new-manager')), {
    uid: 'new-manager', email: 'stranger@evil.test', username: 'New Manager',
    tenantId: 'nissan-mazda', dealershipId: 'nissan', department: 'service',
    role: 'manager', approved: false, status: 'pending', isManager: true,
    jobTitle: 'Manager', createdAt: new Date(),
  })));
await check('A pending manager still CANNOT read another store\'s customer',
  assertFails(getDoc(doc(
    testEnv.authenticatedContext('stranger', { email: 'stranger@evil.test' }).firestore(),
    `${ROOT}/customers/cust-hyundai`))));
const sneakCtx = testEnv.authenticatedContext('sneaky', { email: 'sneaky@new.test' }).firestore();
await check('An advisor CANNOT self-set isManager',
  assertFails(setDoc(doc(sneakCtx, userPath('sneaky')), {
    email: 'stranger@evil.test', role: 'pending', approved: false, status: 'pending',
    department: 'service', tenantId: 'nissan-mazda', dealershipId: 'nissan',
    isManager: true,
  })));

console.log('\nMonth-end archive (run by managers, not just admins)');
const IMPORTS = 'artifacts/hyundai-sales-to-service/public/audit/imports';
await check('A Hyundai advisor CAN write their own store\'s archive audit record',
  assertSucceeds(setDoc(doc(advisor, `${IMPORTS}/hyundai_2026-08_archive_payload`), {
    dealershipId: 'hyundai', targetYearMonth: '2026-08', archivedBy: 'advisor@hyundai.test',
  })));
await check('A Nissan manager CANNOT write an archive record for Hyundai',
  assertFails(setDoc(doc(nissanMgr, `${IMPORTS}/hyundai_2026-09_archive_payload`), {
    dealershipId: 'hyundai', targetYearMonth: '2026-09', archivedBy: 'mgr@nissan.test',
  })));
await check('A Nissan manager CANNOT read Hyundai\'s archive record',
  assertFails(getDoc(doc(nissanMgr, `${IMPORTS}/hyundai_2026-08_archive_payload`))));

console.log('\nLegitimate access still works');
await check('Hyundai advisor CAN read their own store customer',
  assertSucceeds(getDoc(doc(advisor, `${ROOT}/customers/cust-hyundai`))));
await check('Hyundai advisor CAN list their own store customers',
  assertSucceeds(getDocs(query(collection(advisor, `${ROOT}/customers`), where('dealershipId', '==', 'hyundai')))));
await check('Hyundai advisor CAN read their own dealershipSettings',
  assertSucceeds(getDoc(doc(advisor, `${ROOT}/dealershipSettings/hyundai`))));
await check('Hyundai advisor CAN read their own store system log',
  assertSucceeds(getDoc(doc(advisor, 'artifacts/hyundai-sales-to-service/public/audit/systemLogs/log1'))));

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
