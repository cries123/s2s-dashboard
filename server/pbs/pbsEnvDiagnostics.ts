import { loadServiceAccountFromEnv } from '../admin/parseServiceAccountJson.js';
import { isPbsPartnerHubConfigured } from './partnerHubConfig.js';

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
    redeployHint:
      'After changing Netlify env vars you must trigger a new production deploy (Deploys → Trigger deploy). Saving variables alone is not enough.',
  };
}
