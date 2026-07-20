import { loadServiceAccountFromEnv } from '../admin/parseServiceAccountJson.js';
import { isPbsPartnerHubConfigured } from './partnerHubConfig.js';
import { getPbsSyncSecret } from './pbsSyncAuth.js';

function envPresent(name: string): boolean {
  const value = process.env[name]?.trim();
  return !!(value && !value.includes('YOUR_'));
}

export function getPbsEnvDiagnostics() {
  const missingPbsVars: string[] = [];
  if (!envPresent('PBS_PARTNER_USERNAME')) missingPbsVars.push('PBS_PARTNER_USERNAME');
  if (!envPresent('PBS_PARTNER_PASSWORD')) missingPbsVars.push('PBS_PARTNER_PASSWORD');
  if (!envPresent('PBS_SERIAL_NUMBER') && !envPresent('PBS_API_ACCESS_CODE')) {
    missingPbsVars.push('PBS_SERIAL_NUMBER');
  }

  const serviceAccount = loadServiceAccountFromEnv();

  return {
    pbsConfigured: isPbsPartnerHubConfigured(),
    missingPbsVars,
    firestoreAdminReady: serviceAccount.status === 'ready',
    serviceAccountStatus: serviceAccount.status,
    serviceAccountMessage: serviceAccount.message,
    hasServiceAccountJson: envPresent('FIREBASE_SERVICE_ACCOUNT_JSON'),
    hasServiceAccountBase64: envPresent('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64'),
    firebaseProjectId: process.env.VITE_FIREBASE_PROJECT_ID?.trim() || null,
    redeployHint:
      'After changing Netlify env vars you must trigger a new production deploy (Deploys → Trigger deploy). Saving variables alone is not enough.',
  };
}

export function getPbsCronDiagnostics() {
  const env = getPbsEnvDiagnostics();
  return {
    schedule: '@hourly (executes pull at 6:00 AM America/Los_Angeles)',
    functionName: 'pbs-daily-sync',
    cronReady: env.pbsConfigured && env.firestoreAdminReady,
    pbsSyncSecretConfigured: Boolean(getPbsSyncSecret()),
    missingForCron: [
      ...(!env.pbsConfigured ? env.missingPbsVars : []),
      ...(!env.firestoreAdminReady ? ['FIREBASE_SERVICE_ACCOUNT_JSON'] : []),
    ],
    setupHint:
      'Netlify runs the pbs-daily-sync function every hour. It only pulls PBS data during the 6 AM Pacific hour. After saving env vars, trigger a new production deploy.',
  };
}
